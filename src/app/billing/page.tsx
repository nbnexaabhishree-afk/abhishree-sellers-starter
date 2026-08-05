import { AppShell } from "@/components/layout/app-shell";
import { getStripeEnvValidation } from "@/lib/env";
import { requireUser } from "@/lib/auth/require-user";
import { requireWorkspace } from "@/lib/workspaces/context";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const { supabase } = await requireUser();
  const workspace = await requireWorkspace();
  const monthStart = new Date();
  monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const [{ data: subscription }, { data: usage }, { data: plans }] = await Promise.all([
    supabase.from("workspace_subscriptions").select("plan_key, status, current_period_end, cancel_at_period_end, stripe_customer_id, subscription_plans(name, monthly_message_limit, monthly_lead_limit, member_limit)").eq("workspace_id", workspace.workspaceId).single(),
    supabase.from("usage_events").select("metric, quantity").eq("workspace_id", workspace.workspaceId).gte("occurred_at", monthStart.toISOString()),
    supabase.from("subscription_plans").select("key, name, monthly_message_limit, monthly_lead_limit, member_limit").order("monthly_message_limit")
  ]);
  const query = await searchParams;
  const totals = (usage ?? []).reduce<Record<string, number>>((result, item) => {
    result[item.metric] = (result[item.metric] ?? 0) + item.quantity; return result;
  }, {});
  const stripeReady = getStripeEnvValidation().ok;

  return (
    <AppShell workspace={workspace} title="Billing & usage" subtitle="Manage subscription and monitor monthly limits.">
      {query.checkout === "success" ? <div className="notice">Checkout completed. Stripe is synchronizing your subscription.</div> : null}
      <section className="grid grid--cards">
        <article className="card"><p className="eyebrow">Current plan</p><h2>{subscription?.plan_key ?? "free"}</h2><p className="muted">Status: {subscription?.status ?? "active"}</p></article>
        <article className="card"><p className="eyebrow">Messages this month</p><h2>{totals.whatsapp_message ?? 0}</h2></article>
        <article className="card"><p className="eyebrow">Seller leads this month</p><h2>{totals.seller_lead ?? 0}</h2></article>
      </section>
      <section className="grid grid--cards">
        {(plans ?? []).map((plan) => (
          <article className="card" key={plan.key}>
            <h3>{plan.name}</h3>
            <p>{plan.monthly_message_limit.toLocaleString()} messages · {plan.monthly_lead_limit.toLocaleString()} leads · {plan.member_limit} members</p>
            {workspace.role === "owner" && plan.key !== "free" ? (
              <form action="/api/billing/checkout" method="post"><input type="hidden" name="plan" value={plan.key} /><button disabled={!stripeReady} type="submit">Choose {plan.name}</button></form>
            ) : null}
          </article>
        ))}
      </section>
      {workspace.role === "owner" && subscription?.stripe_customer_id ? (
        <section className="card"><h3>Manage billing</h3><form action="/api/billing/portal" method="post"><button type="submit">Open customer portal</button></form></section>
      ) : null}
      {!stripeReady ? <section className="card"><p className="muted">Checkout is disabled until Stripe keys and Starter/Pro price IDs are configured.</p></section> : null}
    </AppShell>
  );
}
