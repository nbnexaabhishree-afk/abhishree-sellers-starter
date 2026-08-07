import { createHmac, timingSafeEqual } from "node:crypto";

import { getRazorpayEnv } from "@/lib/env";

export type PaidPlan = "starter" | "pro";

export type RazorpaySubscription = {
  id: string;
  plan_id: string;
  customer_id?: string | null;
  status: string;
  current_end?: number | null;
  notes?: Record<string, string> | [];
  has_scheduled_changes?: boolean;
  change_scheduled_at?: number | null;
};

export function razorpayPlanFor(plan: PaidPlan) {
  const env = getRazorpayEnv();
  return plan === "starter" ? env.RAZORPAY_STARTER_PLAN_ID : env.RAZORPAY_PRO_PLAN_ID;
}

export function planForRazorpayId(planId: string | undefined): "free" | PaidPlan {
  if (!planId) return "free";
  const env = getRazorpayEnv();
  if (planId === env.RAZORPAY_STARTER_PLAN_ID) return "starter";
  if (planId === env.RAZORPAY_PRO_PLAN_ID) return "pro";
  return "free";
}

export function normalizeRazorpayStatus(status: string) {
  if (["authenticated", "active"].includes(status)) return "active";
  if (["pending", "halted"].includes(status)) return "past_due";
  if (status === "cancelled") return "canceled";
  if (["paused", "completed", "expired"].includes(status)) return status;
  return "incomplete";
}

function matchesHmac(value: string, signature: string, secret: string) {
  const expected = Buffer.from(createHmac("sha256", secret).update(value).digest("hex"));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function verifyRazorpayCheckoutSignature(
  paymentId: string,
  subscriptionId: string,
  signature: string,
  secret = getRazorpayEnv().RAZORPAY_KEY_SECRET
) {
  return matchesHmac(`${paymentId}|${subscriptionId}`, signature, secret);
}

export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signature: string,
  secret = getRazorpayEnv().RAZORPAY_WEBHOOK_SECRET
) {
  return matchesHmac(rawBody, signature, secret);
}

export async function razorpayRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const env = getRazorpayEnv();
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64")}`,
      "content-type": "application/json",
      ...init.headers
    },
    signal: AbortSignal.timeout(15000)
  });
  const body = await response.json() as T & { error?: { description?: string } };
  if (!response.ok) throw new Error(body.error?.description ?? `Razorpay API returned ${response.status}`);
  return body;
}

export function createRazorpaySubscription(plan: PaidPlan, workspaceId: string, userId: string) {
  return razorpayRequest<RazorpaySubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      plan_id: razorpayPlanFor(plan),
      total_count: 1200,
      quantity: 1,
      customer_notify: false,
      notes: { workspaceId, planKey: plan, userId }
    })
  });
}

export function fetchRazorpaySubscription(subscriptionId: string) {
  return razorpayRequest<RazorpaySubscription>(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

export function cancelRazorpaySubscription(subscriptionId: string) {
  return razorpayRequest<RazorpaySubscription>(`/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ cancel_at_cycle_end: true })
  });
}
