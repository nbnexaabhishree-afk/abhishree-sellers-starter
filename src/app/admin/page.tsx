import Link from "next/link";

import { requireSuperAdmin } from "@/lib/auth/super-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function SuperAdminPage() {
  await requireSuperAdmin();
  const admin = createSupabaseAdminClient();
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const [{ data: workspaces }, contacts, leads, messages] = await Promise.all([
    admin.from("workspaces").select("id, name, slug, status, created_at, workspace_subscriptions(plan_key, status)").order("created_at", { ascending: false }),
    admin.from("contacts").select("id", { count: "exact", head: true }),
    admin.from("seller_leads").select("id", { count: "exact", head: true }),
    admin.from("usage_events").select("id", { count: "exact", head: true }).eq("metric", "whatsapp_message").gte("occurred_at", monthStart.toISOString())
  ]);
  return (
    <main className="admin-page">
      <div className="row-between"><div><p className="eyebrow">SaaS control plane</p><h1>Super-admin dashboard</h1></div><Link className="button-link" href="/dashboard">Open app</Link></div>
      <section className="grid grid--cards">
        <article className="card"><h2>{workspaces?.length ?? 0}</h2><p className="muted">Workspaces</p></article>
        <article className="card"><h2>{contacts.count ?? 0}</h2><p className="muted">Contacts</p></article>
        <article className="card"><h2>{leads.count ?? 0}</h2><p className="muted">Seller leads</p></article>
        <article className="card"><h2>{messages.count ?? 0}</h2><p className="muted">Messages this month</p></article>
      </section>
      <section className="card"><h3>Tenants</h3><ul className="stack-list">{(workspaces ?? []).map((workspace) => {
        const subscription = Array.isArray(workspace.workspace_subscriptions) ? workspace.workspace_subscriptions[0] : workspace.workspace_subscriptions;
        return <li key={workspace.id}><div><strong>{workspace.name}</strong><p className="muted">{workspace.slug} · created {new Date(workspace.created_at).toLocaleDateString()}</p></div><span className="pill">{subscription?.plan_key ?? "free"} · {workspace.status}</span></li>;
      })}</ul></section>
    </main>
  );
}
