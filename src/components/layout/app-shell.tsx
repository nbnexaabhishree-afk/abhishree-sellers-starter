import Link from "next/link";

type AppShellProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

const navItems = [
  { label: "Dashboard", href: "#dashboard" },
  { label: "Contacts", href: "#contacts" },
  { label: "Campaigns", href: "#campaigns" },
  { label: "Inbox", href: "#inbox" },
  { label: "Enquiries", href: "#enquiries" },
  { label: "Media", href: "#media" },
  { label: "Settings", href: "#settings" }
];

export function AppShell({ title, subtitle, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <div className="brand-mark">AS</div>
          <div>
            <p className="brand-name">Abhishree Sellers</p>
            <p className="brand-caption">Admin console</p>
          </div>
        </div>

        <nav className="sidebar__nav" aria-label="Primary">
          {navItems.map((item) => (
            <Link key={item.label} href={item.href} className="sidebar__link">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar__footer">
          <p>Cloud-ready</p>
          <span>WhatsApp + Supabase</span>
        </div>
      </aside>

      <main className="main-content">
        <header className="page-header">
          <div>
            <p className="eyebrow">Operations dashboard</p>
            <h1>{title}</h1>
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
          <div className="page-header__actions">
            <div className="page-header__chip">Stage 1 foundation</div>
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
