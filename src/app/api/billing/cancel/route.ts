import { NextResponse } from "next/server";

import { cancelRazorpaySubscription } from "@/lib/billing/razorpay";
import { syncRazorpaySubscription } from "@/lib/billing/razorpay-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireApiWorkspace } from "@/lib/workspaces/context";

export async function POST(request: Request) {
  const workspace = await requireApiWorkspace();
  if (!workspace.ok) return workspace.response;
  if (workspace.context.role !== "owner") return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("workspace_subscriptions")
    .select("razorpay_subscription_id")
    .eq("workspace_id", workspace.context.workspaceId)
    .single();
  if (!data?.razorpay_subscription_id) {
    return NextResponse.json({ error: "No Razorpay subscription exists for this workspace" }, { status: 409 });
  }
  try {
    const subscription = await cancelRazorpaySubscription(data.razorpay_subscription_id);
    await syncRazorpaySubscription(admin, subscription, workspace.context.workspaceId);
    await admin.from("workspace_subscriptions").update({ cancel_at_period_end: true })
      .eq("workspace_id", workspace.context.workspaceId);
    return NextResponse.redirect(new URL("/billing?cancel=scheduled", request.url), { status: 303 });
  } catch {
    return NextResponse.json({ error: "Subscription could not be cancelled" }, { status: 503 });
  }
}
