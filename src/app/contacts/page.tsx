import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/require-user";

export default async function ContactsPage() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("contacts").select("*").order("created_at", { ascending: false });

  return (
    <AppShell title="Contacts" subtitle="Use the contacts workspace to manage property-owner records.">
      <section className="card">
        <div className="row-between">
          <h3>Contact directory</h3>
          <Link href="/dashboard" className="button-link">Back to dashboard</Link>
        </div>
        {error ? (
          <p className="muted">Unable to load contacts from the current Supabase configuration.</p>
        ) : data && data.length > 0 ? (
          <ul className="stack-list">
            {data.map((contact) => (
              <li key={contact.id}>
                <div>
                  <strong>{contact.name ?? contact.phone}</strong>
                  <p className="muted">{contact.phone} · {contact.status}</p>
                </div>
                <span className="pill">{contact.do_not_contact ? "Do not contact" : "Active"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No contacts stored yet" description="Create imports or add contacts through the repository layer once Supabase is configured." />
        )}
      </section>
    </AppShell>
  );
}
