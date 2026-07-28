import { createHash } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getWhatsAppEnvValidation } from "@/lib/env";
import {
  logSupabasePersistenceIssue,
  runSupabaseOperation
} from "@/lib/repositories/whatsapp-webhook-repository";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  detectOptOut,
  extractWebhookMessages,
  normalizeMessageBody,
  normalizeWebhookPayload,
  normalizeWhatsAppId,
  verifyWebhookSignature
} from "@/lib/whatsapp/service";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

function createEventKey(rawBody: string) {
  return `wa:${createHash("sha256").update(rawBody).digest("hex")}`;
}

async function sendWhatsAppMessage(to: string, text: string) {
  if (process.env.NODE_ENV === "test") {
    return { ok: true, skipped: true };
  }

  console.log("Sending WhatsApp reply", { to, text });

  const response = await fetch(
    `https://graph.facebook.com/v25.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
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
      .eq("event_key", eventKey)
      .select("id, processing_status")
      .single()
  );
}

async function failStoredEvent(
  supabase: AdminClient,
  eventKey: string,
  operation: string,
  message: string,
  status = 500
) {
  const updateResult = await updateEventStatus(supabase, eventKey, "failed", message);
  if (!updateResult.ok) {
    logSupabasePersistenceIssue(`${operation}_status_update`, eventKey, null, updateResult.code);
  }

  return NextResponse.json(
    { ok: false, error: "Webhook persistence failed", requestKey: eventKey },
    { status }
  );
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  const providedToken = token?.trim();

  if (mode === "subscribe" && providedToken && providedToken === expectedToken && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }

  return NextResponse.json({ error: "Webhook verification failed" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const whatsappValidation = getWhatsAppEnvValidation();
  if (!whatsappValidation.ok) {
    return NextResponse.json({ error: "WhatsApp credentials are not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const bypass = process.env.NODE_ENV !== "production" && process.env.WHATSAPP_SIGNATURE_BYPASS === "true";

  if (!bypass && !verifyWebhookSignature(rawBody, signature)) {
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
    const failedResult = await updateEventStatus(supabase, eventKey, "failed", message);
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
      const failedResult = await updateEventStatus(supabase, eventKey, "failed", failure);
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
      return failStoredEvent(supabase, eventKey, "normalize_sender", "Sender identifier could not be normalized");
    }

    const contactResult = await runSupabaseOperation<Record<string, unknown>>(
      "find_contact",
      eventKey,
      () => supabase
        .from("contacts")
        .select("id, do_not_contact, status")
        .eq("normalized_phone", normalizedPhone)
        .maybeSingle(),
      { requireData: false }
    );
    if (!contactResult.ok) {
      return failStoredEvent(supabase, eventKey, "find_contact", contactResult.message);
    }

    const contactRecord = contactResult.data;
    const whatsappContactResult = await runSupabaseOperation(
      "upsert_whatsapp_contact",
      eventKey,
      () => supabase
        .from("whatsapp_contacts")
        .upsert({
          wa_id: waId,
          contact_id: contactRecord?.id ?? null,
          profile_name: profileName,
          last_inbound_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: "wa_id" })
        .select("id")
        .single()
    );
    if (!whatsappContactResult.ok) {
      return failStoredEvent(supabase, eventKey, "upsert_whatsapp_contact", whatsappContactResult.message);
    }

    const body = normalizeMessageBody(message);
    const optedOut = detectOptOut(body);

    await sendWhatsAppMessage(
      waId,
      "Hello 👋 Welcome to Abhishree Homes. Are you looking to buy, sell, or rent a property?"
    );
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
          .eq("id", contactRecord.id)
          .select("id")
          .single()
      );
      if (!contactUpdateResult.ok) {
        return failStoredEvent(supabase, eventKey, "update_contact_from_inbound_message", contactUpdateResult.message);
      }
    }

    const messageType = typeof message.type === "string" && message.type ? message.type : "unsupported";
    const messageResult = await runSupabaseOperation(
      "upsert_inbound_message",
      eventKey,
      () => supabase
        .from("messages")
        .upsert({
          whatsapp_message_id: messageId,
          contact_id: contactRecord?.id ?? null,
          direction: "inbound",
          message_type: messageType,
          body,
          status: "received",
          raw_payload: message,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: "whatsapp_message_id", ignoreDuplicates: true })
        .select("id, whatsapp_message_id")
        .maybeSingle(),
      { requireData: false }
    );
    if (!messageResult.ok && !messageResult.duplicate) {
      return failStoredEvent(supabase, eventKey, "upsert_inbound_message", messageResult.message);
    }
  }

  const processedResult = await updateEventStatus(supabase, eventKey, "processed");
  if (!processedResult.ok) {
    return NextResponse.json(
      { ok: false, error: "Webhook status could not be stored", requestKey: eventKey },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, accepted: true, requestKey: eventKey });
}
