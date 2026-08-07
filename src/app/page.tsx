import Link from "next/link";

const features = [
  ["Nine-field seller intake", "Validate property details and media through a guided WhatsApp conversation."],
  ["Isolated client workspaces", "Keep every client’s contacts, messages, leads, media, credentials, and team separate."],
  ["Secure integrations", "Store WhatsApp credentials encrypted and use a dedicated webhook URL per workspace."],
  ["Team and billing controls", "Invite agents, enforce roles and limits, and manage subscriptions through Razorpay."]
];

export default function HomePage() {
  return (
    <main className="landing-page">
      <nav className="landing-nav"><div className="sidebar__brand"><div className="brand-mark">PF</div><strong>PropertyFlow</strong></div><div className="member-actions"><Link href="/login">Sign in</Link><Link className="button-link" href="/register">Start free</Link></div></nav>
      <section className="landing-hero">
        <p className="eyebrow">WhatsApp seller acquisition SaaS</p>
        <h1>Turn property-owner conversations into structured, workspace-ready leads.</h1>
        <p className="muted">Give each real-estate client an isolated workspace, their own WhatsApp integration, guided seller intake, team access, and measurable usage.</p>
        <div className="landing-actions"><Link className="button-link" href="/register">Create a workspace</Link><Link href="/login">Sign in to your account</Link></div>
      </section>
      <section className="grid grid--cards">{features.map(([title, description]) => <article className="card" key={title}><h3>{title}</h3><p className="muted">{description}</p></article>)}</section>
    </main>
  );
}
