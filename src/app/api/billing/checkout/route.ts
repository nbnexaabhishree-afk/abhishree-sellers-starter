import { NextResponse } from "next/server";
import { z } from "zod";

import { getRedirectOrigin } from "@/lib/auth/redirect-origin";
import { createStripeClient, stripePriceForPlan } from "@/lib/billing/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireApiWorkspace } from "@/lib/workspaces/context";

const schema = z.object({ plan: z.enum(["starter", "pro"]) });

export async function POST(request: Request) {
  const workspace = await requireApiWorkspace();
  if (!workspace.ok) return workspace.response;
  if (workspace.context.role !== "owner") return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  const contentType = request.headers.get("content-type") ?? "";
  const input = contentType.includes("application/json") ? await request.json() : Object.fromEntries(await request.formData());
  const parsed = schema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

  try {
    const admin = createSupabaseAdminClient();
    const [{ data: subscription }, { data: userData }] = await Promise.all([
      admin.from("workspace_subscriptions").select("stripe_customer_id").eq("workspace_id", workspace.context.workspaceId).single(),
      admin.auth.admin.getUserById(workspace.context.userId)
    ]);
    const origin = getRedirectOrigin(request.url);
    const session = await createStripeClient().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: stripePriceForPlan(parsed.data.plan), quantity: 1 }],
      success_url: `${origin}/billing?checkout=success`,
      cancel_url: `${origin}/billing?checkout=cancelled`,
      allow_promotion_codes: true,
      ...(subscription?.stripe_customer_id
        ? { customer: subscription.stripe_customer_id }
        : { customer_email: userData.user?.email }),
      metadata: { workspaceId: workspace.context.workspaceId, planKey: parsed.data.plan },
      subscription_data: { metadata: { workspaceId: workspace.context.workspaceId, planKey: parsed.data.plan } }
    });
    if (!session.url) throw new Error("Stripe Checkout did not return a URL");
    return NextResponse.redirect(session.url, { status: 303 });
  } catch {
    return NextResponse.json({ error: "Billing is not configured or Checkout could not be created" }, { status: 503 });
  }
}
