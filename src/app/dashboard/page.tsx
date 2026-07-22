import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/require-user";

export default async function DashboardPage() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("contacts").select("*").limit(5);

  return (
    <AppShell title="Dashboard" subtitle="Protected admin area for your contact operations.">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Secure workspace</p>
          <h2>Supabase-backed contact management</h2>
          <p className="muted">This view is now protected and ready for live contact data.</p>
        </div>
        <form action="/auth/sign-out" method="post">
          <button type="submit">Sign out</button>
        </form>
      </section>

      <section className="card">
        <h3>Recent contacts</h3>
        {error ? (
          <p className="muted">Unable to load contacts right now.</p>
        ) : (data && data.length > 0 ? (
          <ul className="stack-list">
            {data.map((contact) => (
              <li key={contact.id}>
                <strong>{contact.name ?? contact.phone}</strong>
                <span className="muted">{contact.phone}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No contacts yet" description="Import your first batch to begin syncing with Supabase." />
        ))}
      </section>
    </AppShell>
  );
}
