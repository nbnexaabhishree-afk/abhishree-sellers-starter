import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth/require-user";

export default async function OnboardingPage() {
  await requireUser();

  return (
    <AppShell title="Create your workspace" subtitle="Set up a client workspace to isolate contacts, conversations, and integrations.">
      <section className="card">
        <form action="/api/workspaces" method="post" className="stack-list">
          <label>
            Workspace name
            <input name="name" required minLength={2} maxLength={120} placeholder="Acme Realty" />
          </label>
          <label>
            Workspace URL slug
            <input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="acme-realty" />
          </label>
          <button type="submit">Create workspace</button>
        </form>
      </section>
    </AppShell>
  );
}
