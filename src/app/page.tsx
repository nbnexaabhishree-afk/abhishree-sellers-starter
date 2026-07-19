import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";

const cards = [
  ["Contacts", "Upload and manage property-owner contacts"],
  ["Campaigns", "Send approved WhatsApp template campaigns"],
  ["Inbox", "Review seller and landlord replies"],
  ["Enquiries", "Track sale and rental property details"],
  ["Media", "Store seller photos, videos and documents"],
  ["Settings", "Manage webhook, messaging, and team controls"]
];

export default function HomePage() {
  return (
    <AppShell title="Dashboard" subtitle="Monitor contacts, campaigns, and property enquiries in one place.">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Foundation ready</p>
          <h2>Admin workspace for your WhatsApp property funnel</h2>
          <p className="muted">
            This shell is designed for secure, staged rollout. No real WhatsApp credentials or production data are connected yet.
          </p>
        </div>
        <div className="hero-card__pill">No live integrations</div>
      </section>

      <section className="grid grid--cards">
        {cards.map(([title, description]) => (
          <article className="card" key={title}>
            <h3>{title}</h3>
            <p className="muted">{description}</p>
          </article>
        ))}
      </section>

      <section className="stack-section">
        <LoadingState title="Syncing workspace" description="The initial dashboard state is loading safely in the background." />
        <EmptyState
          title="No contacts yet"
          description="Upload your first list to begin building campaigns and collecting replies."
          action={<button type="button">Import contacts</button>}
        />
        <ErrorState title="Webhook not configured" description="Environment variables will be validated before live events are accepted." />
      </section>
    </AppShell>
  );
}
