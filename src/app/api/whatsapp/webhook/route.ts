import { createHash } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  logSupabasePersistenceIssue,
  runSupabaseOperation
} from "@/lib/repositories/whatsapp-webhook-repository";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ABHISHREE_WORKSPACE_ID } from "@/lib/workspaces/constants";
import { ConversationEngine } from "@/lib/whatsapp/conversation-engine";
import {
  isSellerConversationStart,
  snapshotFromConversationRow,
  toConversationInput,
  toPropertyMediaInsert,
  toSellerLeadInsert
} from "@/lib/whatsapp/conversation-webhook";
import {
  detectOptOut,
  extractWebhookMessages,
  normalizeMessageBody,
  normalizeWebhookPayload,
  normalizeWhatsAppId,
  environmentWhatsAppCredentials,
  WhatsAppCredentials,
  verifyWebhookSignature
} from "@/lib/whatsapp/service";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

function createEventKey(rawBody: string) {
  return `wa:${createHash("sha256").update(rawBody).digest("hex")}`;
}

async function sendWhatsAppMessage(to: string, text: string, credentials: WhatsAppCredentials) {
  if (process.env.NODE_ENV === "test") {
    return { ok: true, skipped: true };
  }

  console.log("Sending WhatsApp reply", { to, text });

  const response = await fetch(
    `https://graph.facebook.com/${credentials.apiVersion}/${credentials.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: {
          body: text
        }
      })
    }
  );

  const responseText = await response.text();
  console.log("WhatsApp API response", response.status, responseText);
  if (!response.ok) {
    console.error("WhatsApp send failed", responseText);
  }

  try {
    return responseText ? JSON.parse(responseText) : { ok: response.ok };
  } catch {
    return { ok: response.ok, raw: responseText };
  }
}

async function updateEventStatus(
  supabase: AdminClient,
  workspaceId: string,
  eventKey: string,
  processingStatus: "processed" | "failed",
  errorMessage: string | null = null
) {
  return runSupabaseOperation(
    `update_raw_event_${processingStatus}`,
    eventKey,
    () => supabase
      .from("whatsapp_webhook_events")
      .update({
        processing_status: processingStatus,
        error_message: errorMessage,
        processed_at: new Date().toISOString()
      })
      .eq("workspace_id", workspaceId)
      .eq("event_key", eventKey)
      .select("id, processing_status")
      .single()
  );
}

async function failStoredEvent(
  supabase: AdminClient,
  workspaceId: string,
  eventKey: string,
  operation: string,
  message: string,
  status = 500
) {
  const updateResult = await updateEventStatus(supabase, workspaceId, eventKey, "failed", message);
  if (!updateResult.ok) {
    logSupabasePersistenceIssue(`${operation}_status_update`, eventKey, null, updateResult.code);
  }

  return NextResponse.json(
    { ok: false, error: "Webhook persistence failed", requestKey: eventKey },
    { status }
  );
}

export type WebhookRuntime = {
  workspaceId: string;
  workspaceName: string;
  credentials: WhatsAppCredentials;
};

export async function handleWebhookVerification(request: NextRequest, runtime: WebhookRuntime) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const expectedToken = runtime.credentials.verifyToken.trim();
  const providedToken = token?.trim();

  if (mode === "subscribe" && providedToken && providedToken === expectedToken && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }

  return NextResponse.json({ error: "Webhook verification failed" }, { status: 403 });
}

export async function handleWhatsAppWebhook(request: NextRequest, runtime: WebhookRuntime) {
  const { workspaceId, workspaceName, credentials } = runtime;
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const bypass = process.env.NODE_ENV !== "production" && process.env.WHATSAPP_SIGNATURE_BYPASS === "true";

  if (!bypass && !verifyWebhookSignature(rawBody, signature, credentials.appSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventKey = createEventKey(rawBody);
  const supabase = createSupabaseAdminClient();
  const rawEventResult = await runSupabaseOperation(
    "insert_raw_webhook_event",
    eventKey,
    () => supabase
      .from("whatsapp_webhook_events")
      .insert({
        workspace_id: workspaceId,
        event_key: eventKey,
        provider: "whatsapp",
        payload,
        processing_status: "queued",
        attempts: 1,
        received_at: new Date().toISOString()
      })
      .select("id, event_key, processing_status")
      .single(),
    { logUniqueConflict: true }
  );

  if (!rawEventResult.ok) {
    if (rawEventResult.duplicate) {
      return NextResponse.json({ ok: true, accepted: true, duplicate: true, requestKey: eventKey });
    }
    return NextResponse.json(
      { ok: false, error: "Webhook event could not be stored", requestKey: eventKey },
      { status: 500 }
    );
  }

  const normalizedPayload = normalizeWebhookPayload(payload);
  if (!normalizedPayload) {
    const message = "Unsupported WhatsApp webhook payload shape";
    console.error("WhatsApp webhook normalization issue", {
      operation: "normalize_webhook_payload",
      code: "unsupported_payload",
      message,
      eventKey
    });
    const failedResult = await updateEventStatus(supabase, workspaceId, eventKey, "failed", message);
    if (!failedResult.ok) {
      return NextResponse.json(
        { ok: false, error: "Webhook status could not be stored", requestKey: eventKey },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, accepted: false, requestKey: eventKey });
  }

  const extractedMessages = extractWebhookMessages(normalizedPayload);
  for (const { message, profileName } of extractedMessages) {
    const messageId = typeof message.id === "string" && message.id ? message.id : null;
    const waId = typeof message.from === "string" && message.from ? message.from : null;

    if (!messageId || !waId) {
      const failure = "Normalized message is missing a required identifier";
      console.error("WhatsApp webhook normalization issue", {
        operation: "validate_normalized_message",
        code: "missing_required_value",
        message: failure,
        eventKey
      });
      const failedResult = await updateEventStatus(supabase, workspaceId, eventKey, "failed", failure);
      if (!failedResult.ok) {
        return NextResponse.json(
          { ok: false, error: "Webhook status could not be stored", requestKey: eventKey },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: true, accepted: false, requestKey: eventKey });
    }

    const normalizedPhone = normalizeWhatsAppId(waId);
    if (!normalizedPhone) {
      return failStoredEvent(supabase, workspaceId, eventKey, "normalize_sender", "Sender identifier could not be normalized");
    }

    const contactResult = await runSupabaseOperation<Record<string, unknown>>(
      "find_contact",
      eventKey,
      () => supabase
        .from("contacts")
        .select("id, do_not_contact, status")
        .eq("workspace_id", workspaceId)
        .eq("normalized_phone", normalizedPhone)
        .maybeSingle(),
      { requireData: false }
    );
    if (!contactResult.ok) {
      return failStoredEvent(supabase, workspaceId, eventKey, "find_contact", contactResult.message);
    }

    const contactRecord = contactResult.data;
    const whatsappContactResult = await runSupabaseOperation(
      "upsert_whatsapp_contact",
      eventKey,
      () => supabase
        .from("whatsapp_contacts")
        .upsert({
          workspace_id: workspaceId,
          wa_id: waId,
          contact_id: contactRecord?.id ?? null,
          profile_name: profileName,
          last_inbound_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: "workspace_id,wa_id" })
        .select("id")
        .single()
    );
    if (!whatsappContactResult.ok) {
      return failStoredEvent(supabase, workspaceId, eventKey, "upsert_whatsapp_contact", whatsappContactResult.message);
    }

    const body = normalizeMessageBody(message);
    const optedOut = detectOptOut(body);

    console.log("Reply trigger check", {
      waId,
      tokenExists: !!process.env.WHATSAPP_ACCESS_TOKEN,
      phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID
    });

    if (contactRecord?.id) {
      const contactUpdateResult = await runSupabaseOperation(
        "update_contact_from_inbound_message",
        eventKey,
        () => supabase
          .from("contacts")
          .update({
            last_contacted_at: new Date().toISOString(),
            do_not_contact: optedOut || Boolean(contactRecord.do_not_contact),
            status: optedOut ? "do_not_contact" : contactRecord.status,
            updated_at: new Date().toISOString()
          })
          .eq("workspace_id", workspaceId)
          .eq("id", contactRecord.id)
          .select("id")
          .single()
      );
      if (!contactUpdateResult.ok) {
        return failStoredEvent(supabase, workspaceId, eventKey, "update_contact_from_inbound_message", contactUpdateResult.message);
      }
    }

    const messageType = typeof message.type === "string" && message.type ? message.type : "unsupported";
    const messageResult = await runSupabaseOperation(
      "upsert_inbound_message",
      eventKey,
      () => supabase
        .from("messages")
        .upsert({
          workspace_id: workspaceId,
          whatsapp_message_id: messageId,
          contact_id: contactRecord?.id ?? null,
          direction: "inbound",
          message_type: messageType,
          body,
          status: "received",
          raw_payload: message,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: "workspace_id,whatsapp_message_id", ignoreDuplicates: true })
        .select("id, whatsapp_message_id")
        .maybeSingle(),
      { requireData: false }
    );
    if (!messageResult.ok && !messageResult.duplicate) {
      return failStoredEvent(supabase, workspaceId, eventKey, "upsert_inbound_message", messageResult.message);
    }

    if (optedOut) continue;

    const whatsappContact = whatsappContactResult.data as Record<string, unknown> | null;
    const whatsappContactId = typeof whatsappContact?.id === "string" ? whatsappContact.id : null;
    if (!whatsappContactId) {
      return failStoredEvent(supabase, workspaceId, eventKey, "resolve_whatsapp_contact", "WhatsApp contact ID is missing");
    }

    const activeConversationResult = await runSupabaseOperation<Record<string, unknown>>(
      "find_active_seller_conversation",
      eventKey,
      () => supabase
        .from("conversation_state")
        .select("id, current_step, collected_data, status")
        .eq("workspace_id", workspaceId)
        .eq("whatsapp_contact_id", whatsappContactId)
        .eq("flow_type", "seller")
        .eq("status", "active")
        .maybeSingle(),
      { requireData: false }
    );
    if (!activeConversationResult.ok) {
      return failStoredEvent(supabase, workspaceId, eventKey, "find_active_seller_conversation", activeConversationResult.message);
    }

    const activeConversation = activeConversationResult.data;
    if (!activeConversation) {
      if (isSellerConversationStart(body)) {
        const engine = new ConversationEngine();
        const state = engine.getState();
        const createConversationResult = await runSupabaseOperation(
          "create_seller_conversation",
          eventKey,
          () => supabase
            .from("conversation_state")
            .insert({
              workspace_id: workspaceId,
              whatsapp_contact_id: whatsappContactId,
              contact_id: contactRecord?.id ?? null,
              flow_type: "seller",
              current_step: state.currentStep,
              collected_data: state.collectedData,
              status: state.status
            })
            .select("id")
            .single()
        );
        if (!createConversationResult.ok) {
          return failStoredEvent(supabase, workspaceId, eventKey, "create_seller_conversation", createConversationResult.message);
        }
        await sendWhatsAppMessage(waId, engine.getCurrentStep()!.question, credentials);
      } else {
        await sendWhatsAppMessage(
          waId,
          `Hello 👋 Welcome to ${workspaceName}. Are you looking to buy, sell, or rent a property?`,
          credentials
        );
      }
      continue;
    }

    const snapshot = snapshotFromConversationRow(activeConversation);
    const conversationStateId = typeof activeConversation.id === "string" ? activeConversation.id : null;
    if (!snapshot || !conversationStateId) {
      return failStoredEvent(supabase, workspaceId, eventKey, "load_seller_conversation", "Active conversation state is invalid");
    }

    const engine = new ConversationEngine(snapshot);
    const input = toConversationInput(message, body);
    const result = engine.processInput(input ?? "");
    if (!result.accepted) {
      await sendWhatsAppMessage(waId, result.error, credentials);
      continue;
    }

    const stateUpdateResult = await runSupabaseOperation(
      "update_seller_conversation",
      eventKey,
      () => supabase
        .from("conversation_state")
        .update({
          current_step: result.state.currentStep ?? "completed",
          collected_data: result.state.collectedData,
          status: result.completed ? "completed" : "active",
          completed_at: result.completed ? new Date().toISOString() : null
        })
        .eq("workspace_id", workspaceId)
        .eq("id", conversationStateId)
        .select("id")
        .single()
    );
    if (!stateUpdateResult.ok) {
      return failStoredEvent(supabase, workspaceId, eventKey, "update_seller_conversation", stateUpdateResult.message);
    }

    if (result.completed) {
      const sellerLeadResult = await runSupabaseOperation<Record<string, unknown>>(
        "create_seller_lead",
        eventKey,
        () => supabase
          .from("seller_leads")
          .insert({
            ...toSellerLeadInsert(result.state.collectedData, {
              contactId: typeof contactRecord?.id === "string" ? contactRecord.id : null,
              whatsappContactId,
              conversationStateId
            }),
            workspace_id: workspaceId
          })
          .select("id")
          .single()
      );
      if (!sellerLeadResult.ok) {
        return failStoredEvent(supabase, workspaceId, eventKey, "create_seller_lead", sellerLeadResult.message);
      }

      const sellerLeadId = typeof sellerLeadResult.data?.id === "string" ? sellerLeadResult.data.id : null;
      const propertyMediaInsert = sellerLeadId
        ? toPropertyMediaInsert(result.state.collectedData, {
            sellerLeadId,
            conversationStateId,
            whatsappMessageId: messageId
          })
        : null;
      if (!propertyMediaInsert) {
        return failStoredEvent(supabase, workspaceId, eventKey, "prepare_property_media", "Completed seller media is missing");
      }

      const propertyMediaResult = await runSupabaseOperation(
        "create_property_media",
        eventKey,
        () => supabase
          .from("property_media")
          .insert({ ...propertyMediaInsert, workspace_id: workspaceId })
          .select("id")
          .single()
      );
      if (!propertyMediaResult.ok) {
        return failStoredEvent(supabase, workspaceId, eventKey, "create_property_media", propertyMediaResult.message);
      }
      await sendWhatsAppMessage(waId, "Thank you. Your property details have been submitted successfully.", credentials);
    } else {
      await sendWhatsAppMessage(waId, result.nextStep!.question, credentials);
    }
  }

  const processedResult = await updateEventStatus(supabase, workspaceId, eventKey, "processed");
  if (!processedResult.ok) {
    return NextResponse.json(
      { ok: false, error: "Webhook status could not be stored", requestKey: eventKey },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, accepted: true, requestKey: eventKey });
}

function legacyAbhishreeRuntime(): WebhookRuntime | null {
  const credentials = environmentWhatsAppCredentials();
  return credentials
    ? { workspaceId: ABHISHREE_WORKSPACE_ID, workspaceName: "Abhishree Homes", credentials }
    : null;
}

export async function GET(request: NextRequest) {
  const runtime = legacyAbhishreeRuntime();
  if (!runtime) {
    return NextResponse.json({ error: "WhatsApp credentials are not configured" }, { status: 500 });
  }
  return handleWebhookVerification(request, runtime);
}

export async function POST(request: NextRequest) {
  const runtime = legacyAbhishreeRuntime();
  if (!runtime) {
    return NextResponse.json({ error: "WhatsApp credentials are not configured" }, { status: 500 });
  }
  return handleWhatsAppWebhook(request, runtime);
}
