import Stripe from "stripe";

import { getStripeEnv } from "@/lib/env";

export type PaidPlan = "starter" | "pro";

export function createStripeClient() {
  return new Stripe(getStripeEnv().STRIPE_SECRET_KEY);
}

export function stripePriceForPlan(plan: PaidPlan) {
  const env = getStripeEnv();
  return plan === "starter" ? env.STRIPE_STARTER_PRICE_ID : env.STRIPE_PRO_PRICE_ID;
}

export function planForStripePrice(priceId: string | undefined): "free" | PaidPlan {
  if (!priceId) return "free";
  const env = getStripeEnv();
  if (priceId === env.STRIPE_STARTER_PRICE_ID) return "starter";
  if (priceId === env.STRIPE_PRO_PRICE_ID) return "pro";
  return "free";
}
