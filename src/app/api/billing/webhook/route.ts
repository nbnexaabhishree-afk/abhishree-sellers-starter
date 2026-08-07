import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { verifyRazorpayWebhookSignature, type RazorpaySubscription } from "@/lib/billing/razorpay";
import { syncRazorpaySubscription } from "@/lib/billing/razorpay-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type RazorpayEvent = {
  event?: string;
  payload?: { subscription?: { entity?: RazorpaySubscription } };
};

export async function POST(request: Request) {
  const signature = request.headers.get("x-razorpay-signature");
  if (!signature) return NextResponse.json({ error: "Missing Razorpay signature" }, { status: 400 });
  const rawBody = await request.text();
  try {
    if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ error: "Invalid Razorpay signature" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Razorpay webhook is not configured" }, { status: 503 });
  }

  let event: RazorpayEvent;
  try {
    event = JSON.parse(rawBody) as RazorpayEvent;
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }
  if (!event.event?.startsWith("subscription.")) {
    return NextResponse.json({ received: true, ignored: true });
  }
  const subscription = event.payload?.subscription?.entity;
  if (!subscription?.id) return NextResponse.json({ error: "Subscription payload is missing" }, { status: 400 });

  const eventId = request.headers.get("x-razorpay-event-id")
    ?? `rzp:${createHash("sha256").update(rawBody).digest("hex")}`;
  const admin = createSupabaseAdminClient();
  const { error: ledgerError } = await admin.from("razorpay_webhook_events")
    .insert({ event_id: eventId, event_type: event.event });
  if (ledgerError?.code === "23505") {
    const { data } = await admin.from("razorpay_webhook_events")
      .select("processing_status").eq("event_id", eventId).single();
    if (data?.processing_status === "processed") {
      return NextResponse.json({ received: true, duplicate: true });
    }
  } else if (ledgerError) {
    return NextResponse.json({ error: "Unable to store billing event" }, { status: 500 });
  }

  try {
    await syncRazorpaySubscription(admin, subscription);
    await admin.from("razorpay_webhook_events").update({
      processing_status: "processed", processed_at: new Date().toISOString(), error_message: null
    }).eq("event_id", eventId);
    return NextResponse.json({ received: true });
  } catch (error) {
    await admin.from("razorpay_webhook_events").update({
      processing_status: "failed",
      error_message: error instanceof Error ? error.message.slice(0, 500) : "Unknown error"
    }).eq("event_id", eventId);
    return NextResponse.json({ error: "Billing event processing failed" }, { status: 500 });
  }
}
