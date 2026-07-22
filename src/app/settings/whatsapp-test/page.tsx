import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth/require-user";

export default async function WhatsAppTestPage() {
  await requireUser();
  return (
    <AppShell title="WhatsApp test" subtitle="Send a single safe test message to one recipient.">
      <section className="card">
        <h3>Single-recipient test</h3>
        <p className="muted">This interface validates the phone number, confirms the contact is not opted out, and sends a single approved template message.</p>
        <form action="/api/whatsapp/test-send" method="post" className="auth-form">
          <label>
            Destination phone
            <input name="to" placeholder="919876543210" required />
          </label>
          <label>
            Template name
            <input name="templateName" placeholder="hello_world" required />
          </label>
          <label>
            Language code
            <input name="languageCode" placeholder="en" defaultValue="en" />
          </label>
          <label>
            Body parameters (comma separated)
            <input name="bodyParameters" placeholder="John,2" />
          </label>
          <button type="submit">Send safe test message</button>
        </form>
      </section>
    </AppShell>
  );
}
