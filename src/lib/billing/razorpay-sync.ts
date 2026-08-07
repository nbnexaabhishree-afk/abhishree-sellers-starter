import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  normalizeRazorpayStatus,
  planForRazorpayId,
  type RazorpaySubscription
} from "@/lib/billing/razorpay";

export async function syncRazorpaySubscription(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  subscription: RazorpaySubscription,
  fallbackWorkspaceId?: string
) {
  const notes = !Array.isArray(subscription.notes) ? subscription.notes : undefined;
  let workspaceId = notes?.workspaceId ?? fallbackWorkspaceId;
  if (!workspaceId) {
    const { data } = await admin.from("workspace_subscriptions")
      .select("workspace_id")
      .eq("razorpay_subscription_id", subscription.id)
      .maybeSingle();
    workspaceId = data?.workspace_id;
  }
  if (!workspaceId) throw new Error("Razorpay subscription has no workspace mapping");

  const status = normalizeRazorpayStatus(subscription.status);
  const paidPlan = planForRazorpayId(subscription.plan_id);
  const update: Record<string, unknown> = {
    status,
    razorpay_subscription_id: subscription.id,
    razorpay_plan_id: subscription.plan_id,
    razorpay_customer_id: subscription.customer_id ?? null,
    current_period_end: subscription.current_end
      ? new Date(subscription.current_end * 1000).toISOString()
      : null,
    cancel_at_period_end: Boolean(subscription.has_scheduled_changes && subscription.change_scheduled_at)
  };
  if (status === "active" && paidPlan !== "free") update.plan_key = paidPlan;

  const { error } = await admin.from("workspace_subscriptions").update(update).eq("workspace_id", workspaceId);
  if (error) throw error;
  return { workspaceId, status, plan: paidPlan };
}
