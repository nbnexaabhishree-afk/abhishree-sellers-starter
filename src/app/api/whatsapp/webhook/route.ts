import { NextRequest, NextResponse } from "next/server";

import { getWhatsAppEnvValidation } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { detectOptOut, normalizeMessageBody, normalizeWebhookPayload, normalizeWhatsAppId, verifyWebhookSignature } from "@/lib/whatsapp/service";

function createEventKey(payload: unknown) {
  const value = payload as Record<string, unknown>;
  const entry = Array.isArray(value?.entry) ? value.entry[0] : undefined;
  const change = Array.isArray(entry?.changes) ? entry.changes[0] : undefined;
  const valueData = change?.value as Record<string, unknown> | undefined;
  const metadata = (valueData?.metadata as Record<string, unknown> | undefined) ?? {};
  const id = metadata.phone_number_id ?? metadata.id ?? "unknown";
  return `wa:${String(id)}:${Date.now().toString(36)}`;
}

function getMessagePayload(entry: Record<string, unknown>) {
  const changes = Array.isArray(entry.changes) ? entry.changes : [];
  const change = changes[0] as Record<string, unknown> | undefined;
  const value = change?.value as Record<string, unknown> | undefined;
  return Array.isArray(value?.messages) ? value.messages[0] : null;
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN && challenge) {
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

  const normalizedPayload = normalizeWebhookPayload(payload);
  if (!normalizedPayload) {
    return NextResponse.json({ ok: true, accepted: false });
  }

  const supabase = createSupabaseAdminClient();
  const eventKey = createEventKey(payload);
  const { error: eventError } = await supabase.from("whatsapp_webhook_events").upsert({
    event_key: eventKey,
    provider: "whatsapp",
    payload,
    processing_status: "queued",
    attempts: 1,
    received_at: new Date().toISOString()
  }, { onConflict: "event_key" });

  if (eventError) {
    return NextResponse.json({ ok: true, accepted: false });
  }

  const entries = Array.isArray(normalizedPayload.entry) ? normalizedPayload.entry : [];
  for (const entry of entries) {
    const message = getMessagePayload(entry as Record<string, unknown>);
    if (!message) {
      continue;
    }

    const waId = typeof message.from === "string" ? message.from : null;
    const normalizedPhone = waId ? normalizeWhatsAppId(waId) : null;
    const body = normalizeMessageBody(message as Record<string, unknown>);
    const messageType = typeof message.type === "string" ? message.type : "unsupported";
    const contactMatch = normalizedPhone ? await supabase.from("contacts").select("*").eq("normalized_phone", normalizedPhone).maybeSingle() : null;

    const contactRecord = contactMatch?.data;
    const whatsappContactPayload = {
      wa_id: waId,
      profile_name: typeof message.profile_name === "string" ? message.profile_name : null,
      last_inbound_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await supabase.from("whatsapp_contacts").upsert(whatsappContactPayload, { onConflict: "wa_id" });

    if (contactRecord) {
      await supabase.from("contacts").update({
        last_contacted_at: new Date().toISOString(),
        do_not_contact: detectOptOut(body) || Boolean(contactRecord.do_not_contact),
        status: detectOptOut(body) ? "do_not_contact" : contactRecord.status,
        updated_at: new Date().toISOString()
      }).eq("id", contactRecord.id);
    }

    await supabase.from("messages").upsert({
      whatsapp_message_id: typeof message.id === "string" ? message.id : null,
      contact_id: contactRecord?.id ?? null,
      direction: "inbound",
      message_type: messageType,
      body,
      status: "received",
      raw_payload: message,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: "whatsapp_message_id" });
  }

  return NextResponse.json({ ok: true, accepted: true });
}
