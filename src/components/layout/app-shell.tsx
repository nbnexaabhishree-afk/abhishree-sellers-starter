import Link from "next/link";

import type { WorkspaceContext } from "@/lib/workspaces/context";

type AppShellProps = {
  title: string;
  subtitle?: string;
  workspace?: WorkspaceContext;
  children: React.ReactNode;
};

const navItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Contacts", href: "/contacts" },
  { label: "Team", href: "/team" },
  { label: "Billing", href: "/billing" },
  { label: "Settings", href: "/settings" }
];

export function AppShell({ title, subtitle, workspace, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <div className="brand-mark">PF</div>
          <div>
            <p className="brand-name">PropertyFlow</p>
            <p className="brand-caption">WhatsApp seller SaaS</p>
          </div>
        </div>

        {workspace ? (
          <form action="/api/workspaces/select" method="post" className="workspace-switcher">
            <label htmlFor="workspaceId">Active workspace</label>
            <select id="workspaceId" name="workspaceId" defaultValue={workspace.workspaceId}>
              {workspace.memberships.map((membership) => (
                <option key={membership.workspaceId} value={membership.workspaceId}>
                  {membership.workspaceName}
                </option>
              ))}
            </select>
            <input type="hidden" name="returnTo" value="/dashboard" />
            <button type="submit">Switch</button>
            <span>{workspace.role}</span>
          </form>
        ) : null}

        <nav className="sidebar__nav" aria-label="Primary">
          {navItems.map((item) => (
            <Link key={item.label} href={item.href} className="sidebar__link">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar__footer">
          <p>Multi-tenant workspace</p>
          <span>WhatsApp + Supabase</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="page-header">
          <div>
            <p className="eyebrow">{workspace?.workspaceName ?? "Property operations"}</p>
            <h1>{title}</h1>
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
          <div className="page-header__actions">
            {workspace ? <div className="page-header__chip">{workspace.workspaceSlug}</div> : null}
            <form action="/auth/sign-out" method="post">
              <button type="submit">Log out</button>
            </form>
          </div>
        </header>

        <div className="content-stack">{children}</div>
      </main>
    </div>
  );
}
