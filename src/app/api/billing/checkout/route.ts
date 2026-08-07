import { NextResponse } from "next/server";
import { z } from "zod";

import { createRazorpaySubscription, razorpayPlanFor } from "@/lib/billing/razorpay";
import { getRazorpayEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireApiWorkspace } from "@/lib/workspaces/context";

const schema = z.object({ plan: z.enum(["starter", "pro"]) });

export async function POST(request: Request) {
  const workspace = await requireApiWorkspace();
  if (!workspace.ok) return workspace.response;
  if (workspace.context.role !== "owner") return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

  try {
    const admin = createSupabaseAdminClient();
    const [{ data: current }, { data: userData }] = await Promise.all([
      admin.from("workspace_subscriptions")
        .select("status, razorpay_subscription_id")
        .eq("workspace_id", workspace.context.workspaceId)
        .single(),
      admin.auth.admin.getUserById(workspace.context.userId)
    ]);
    if (current?.razorpay_subscription_id && current.status === "active") {
      return NextResponse.json({ error: "Cancel the current subscription before choosing another plan" }, { status: 409 });
    }

    const subscription = await createRazorpaySubscription(
      parsed.data.plan,
      workspace.context.workspaceId,
      workspace.context.userId
    );
    const { error } = await admin.from("workspace_subscriptions").update({
      status: "incomplete",
      razorpay_subscription_id: subscription.id,
      razorpay_plan_id: razorpayPlanFor(parsed.data.plan),
      razorpay_customer_id: null,
      current_period_end: null,
      cancel_at_period_end: false
    }).eq("workspace_id", workspace.context.workspaceId);
    if (error) throw error;

    return NextResponse.json({
      keyId: getRazorpayEnv().RAZORPAY_KEY_ID,
      subscriptionId: subscription.id,
      plan: parsed.data.plan,
      customerEmail: userData.user?.email ?? ""
    }, { status: 201 });
  } catch (error) {
    console.error("Razorpay subscription creation failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Razorpay is not configured or the subscription could not be created" }, { status: 503 });
  }
}
