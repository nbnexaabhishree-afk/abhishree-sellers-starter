import { AppShell } from "@/components/layout/app-shell";
import { RazorpayCheckoutButton } from "@/components/billing/razorpay-checkout-button";
import { getRazorpayEnvValidation } from "@/lib/env";
import { requireUser } from "@/lib/auth/require-user";
import { requireWorkspace } from "@/lib/workspaces/context";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string; cancel?: string }> }) {
  const { supabase } = await requireUser();
  const workspace = await requireWorkspace();
  const monthStart = new Date();
  monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const [{ data: subscription }, { data: usage }, { data: plans }] = await Promise.all([
    supabase.from("workspace_subscriptions").select("plan_key, status, current_period_end, cancel_at_period_end, razorpay_subscription_id, subscription_plans(name, monthly_message_limit, monthly_lead_limit, member_limit)").eq("workspace_id", workspace.workspaceId).single(),
    supabase.from("usage_events").select("metric, quantity").eq("workspace_id", workspace.workspaceId).gte("occurred_at", monthStart.toISOString()),
    supabase.from("subscription_plans").select("key, name, monthly_message_limit, monthly_lead_limit, member_limit").order("monthly_message_limit")
  ]);
  const query = await searchParams;
  const totals = (usage ?? []).reduce<Record<string, number>>((result, item) => {
    result[item.metric] = (result[item.metric] ?? 0) + item.quantity; return result;
  }, {});
  const razorpayReady = getRazorpayEnvValidation().ok;
  const canCancel = subscription?.razorpay_subscription_id
    && ["active", "past_due", "paused"].includes(subscription.status)
    && !subscription.cancel_at_period_end;

  return (
    <AppShell workspace={workspace} title="Billing & usage" subtitle="Manage subscription and monitor monthly limits.">
      {query.checkout === "success" ? <div className="notice">Payment verified. Razorpay is synchronizing your subscription.</div> : null}
      {query.cancel === "scheduled" ? <div className="notice">Your subscription will be cancelled at the end of its billing cycle.</div> : null}
      <section className="grid grid--cards">
        <article className="card"><p className="eyebrow">Current plan</p><h2>{subscription?.plan_key ?? "free"}</h2><p className="muted">Status: {subscription?.status ?? "active"}{subscription?.cancel_at_period_end ? " · cancellation scheduled" : ""}</p></article>
        <article className="card"><p className="eyebrow">Messages this month</p><h2>{totals.whatsapp_message ?? 0}</h2></article>
        <article className="card"><p className="eyebrow">Seller leads this month</p><h2>{totals.seller_lead ?? 0}</h2></article>
      </section>
      <section className="grid grid--cards">
        {(plans ?? []).map((plan) => (
          <article className="card" key={plan.key}>
            <h3>{plan.name}</h3>
            <p>{plan.monthly_message_limit.toLocaleString()} messages · {plan.monthly_lead_limit.toLocaleString()} leads · {plan.member_limit} members</p>
            {workspace.role === "owner" && (plan.key === "starter" || plan.key === "pro") ? (
              <RazorpayCheckoutButton plan={plan.key} planName={plan.name} disabled={!razorpayReady || subscription?.status === "active"} />
            ) : null}
          </article>
        ))}
      </section>
      {workspace.role === "owner" && canCancel ? (
        <section className="card"><h3>Cancel subscription</h3><p className="muted">Your paid access continues until the end of the current billing cycle. Cancellation cannot be automatically reversed.</p><form action="/api/billing/cancel" method="post"><button className="button-danger" type="submit">Cancel at cycle end</button></form></section>
      ) : null}
      {!razorpayReady ? <section className="card"><p className="muted">Checkout is disabled until Razorpay keys, webhook secret, and Starter/Pro plan IDs are configured.</p></section> : null}
    </AppShell>
  );
}
