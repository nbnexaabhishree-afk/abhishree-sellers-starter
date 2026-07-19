import { AppShell } from "@/components/layout/app-shell";
import { redactSecret } from "@/lib/whatsapp/service";

export default function SettingsPage() {
  const lastWebhook = null;
  return (
    <AppShell title="Settings" subtitle="Safe WhatsApp configuration and event monitoring.">
      <section className="card">
        <h3>WhatsApp setup status</h3>
        <ul className="stack-list">
          <li><strong>API version configured:</strong> {process.env.WHATSAPP_API_VERSION ? "yes" : "no"}</li>
          <li><strong>Phone number ID configured:</strong> {process.env.WHATSAPP_PHONE_NUMBER_ID ? "yes" : "no"}</li>
          <li><strong>Business account ID configured:</strong> {process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ? "yes" : "no"}</li>
          <li><strong>Webhook verify token configured:</strong> {process.env.WHATSAPP_VERIFY_TOKEN ? "yes" : "no"}</li>
          <li><strong>App secret configured:</strong> {process.env.WHATSAPP_APP_SECRET ? "yes" : "no"}</li>
          <li><strong>Access token configured:</strong> {process.env.WHATSAPP_ACCESS_TOKEN ? "yes" : "no"}</li>
          <li><strong>Webhook URL:</strong> {process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000/api/whatsapp/webhook"}</li>
          <li><strong>Last webhook received:</strong> {lastWebhook ?? "none"}</li>
          <li><strong>Access token preview:</strong> {redactSecret(process.env.WHATSAPP_ACCESS_TOKEN)}</li>
          <li><strong>App secret preview:</strong> {redactSecret(process.env.WHATSAPP_APP_SECRET)}</li>
        </ul>
      </section>
    </AppShell>
  );
}
