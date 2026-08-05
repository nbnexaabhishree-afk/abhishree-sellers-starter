import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { createStripeClient, planForStripePrice } from "@/lib/billing/stripe";
import { getStripeEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const allowedStatuses = new Set(["trialing", "active", "past_due", "canceled", "unpaid", "incomplete"]);

function objectId(value: string | { id: string } | null) {
  return typeof value === "string" ? value : value?.id ?? null;
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const workspaceId = subscription.metadata.workspaceId;
  if (!workspaceId) throw new Error("Stripe subscription has no workspace metadata");
  const firstItem = subscription.items.data[0];
  const status = allowedStatuses.has(subscription.status) ? subscription.status : "incomplete";
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("workspace_subscriptions").upsert({
    workspace_id: workspaceId,
    plan_key: subscription.metadata.planKey || planForStripePrice(firstItem?.price.id),
    status,
    stripe_customer_id: objectId(subscription.customer),
    stripe_subscription_id: subscription.id,
    current_period_end: firstItem?.current_period_end ? new Date(firstItem.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end
  }, { onConflict: "workspace_id" });
  if (error) throw error;
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
  let event: Stripe.Event;
  try {
    event = createStripeClient().webhooks.constructEvent(await request.text(), signature, getStripeEnv().STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error: ledgerError } = await admin.from("stripe_webhook_events").insert({ event_id: event.id, event_type: event.type });
  if (ledgerError?.code === "23505") {
    const { data } = await admin.from("stripe_webhook_events").select("processing_status").eq("event_id", event.id).single();
    if (data?.processing_status === "processed") return NextResponse.json({ received: true, duplicate: true });
  } else if (ledgerError) {
    return NextResponse.json({ error: "Unable to store billing event" }, { status: 500 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const workspaceId = session.metadata?.workspaceId;
      if (!workspaceId) throw new Error("Checkout has no workspace metadata");
      const { error } = await admin.from("workspace_subscriptions").update({
        stripe_customer_id: objectId(session.customer),
        stripe_subscription_id: objectId(session.subscription)
      }).eq("workspace_id", workspaceId);
      if (error) throw error;
    }
    if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
      await syncSubscription(event.data.object as Stripe.Subscription);
    }
    await admin.from("stripe_webhook_events").update({ processing_status: "processed", processed_at: new Date().toISOString(), error_message: null }).eq("event_id", event.id);
    return NextResponse.json({ received: true });
  } catch (error) {
    await admin.from("stripe_webhook_events").update({ processing_status: "failed", error_message: error instanceof Error ? error.message.slice(0, 500) : "Unknown error" }).eq("event_id", event.id);
    return NextResponse.json({ error: "Billing event processing failed" }, { status: 500 });
  }
}
