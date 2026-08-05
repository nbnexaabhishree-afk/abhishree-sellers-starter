import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth/require-user";
import { requireWorkspace } from "@/lib/workspaces/context";
import { ABHISHREE_WORKSPACE_ID } from "@/lib/workspaces/constants";
import { redactSecret } from "@/lib/whatsapp/service";

export default async function SettingsPage() {
  const { supabase } = await requireUser();
  const workspace = await requireWorkspace();
  const { data: integration } = await supabase
    .from("whatsapp_integrations")
    .select("status, credentials_mode, webhook_key")
    .eq("workspace_id", workspace.workspaceId)
    .maybeSingle();
  const usesEnvironmentCredentials = workspace.workspaceId === ABHISHREE_WORKSPACE_ID
    && integration?.credentials_mode === "environment";
  const lastWebhook = null;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";
  const workspaceWebhookUrl = integration?.webhook_key
    ? `${siteUrl.replace(/\/$/, "")}/api/whatsapp/webhook/${integration.webhook_key}`
    : "not configured";
  const legacyWebhookUrl = workspace.workspaceId === ABHISHREE_WORKSPACE_ID
    ? `${siteUrl.replace(/\/$/, "")}/api/whatsapp/webhook`
    : "not applicable";
  const secretPreview = integration?.credentials_mode === "encrypted" && integration.status === "active"
    ? "stored securely"
    : null;
  return (
    <AppShell title="Settings" subtitle="Safe WhatsApp configuration and event monitoring.">
      <section className="card">
        <h3>WhatsApp setup status</h3>
        <ul className="stack-list">
          <li><strong>API version configured:</strong> {usesEnvironmentCredentials && process.env.WHATSAPP_API_VERSION ? "yes" : "no"}</li>
          <li><strong>Workspace integration:</strong> {integration?.status ?? "not configured"}</li>
          <li><strong>Credential source:</strong> {integration?.credentials_mode ?? "none"}</li>
          <li><strong>Phone number ID configured:</strong> {usesEnvironmentCredentials && process.env.WHATSAPP_PHONE_NUMBER_ID ? "yes" : "no"}</li>
          <li><strong>Business account ID configured:</strong> {usesEnvironmentCredentials && process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ? "yes" : "no"}</li>
          <li><strong>Webhook verify token configured:</strong> {usesEnvironmentCredentials && process.env.WHATSAPP_VERIFY_TOKEN ? "yes" : "no"}</li>
          <li><strong>App secret configured:</strong> {usesEnvironmentCredentials && process.env.WHATSAPP_APP_SECRET ? "yes" : "no"}</li>
          <li><strong>Access token configured:</strong> {usesEnvironmentCredentials && process.env.WHATSAPP_ACCESS_TOKEN ? "yes" : "no"}</li>
          <li><strong>Legacy webhook URL:</strong> {legacyWebhookUrl}</li>
          <li><strong>Workspace webhook URL:</strong> {workspaceWebhookUrl}</li>
          <li><strong>Last webhook received:</strong> {lastWebhook ?? "none"}</li>
          <li><strong>Access token preview:</strong> {secretPreview ?? redactSecret(usesEnvironmentCredentials ? process.env.WHATSAPP_ACCESS_TOKEN : undefined)}</li>
          <li><strong>App secret preview:</strong> {secretPreview ?? redactSecret(usesEnvironmentCredentials ? process.env.WHATSAPP_APP_SECRET : undefined)}</li>
        </ul>
      </section>
      {workspace.role !== "agent" ? (
        <section className="card">
          <h3>Configure this workspace</h3>
          <p className="muted">Credentials are encrypted before storage and are never returned by this form.</p>
          <form action="/api/whatsapp/integration" method="post" className="auth-form">
            <label>API version<input name="apiVersion" defaultValue="v25.0" required /></label>
            <label>Phone number ID<input name="phoneNumberId" required /></label>
            <label>Business account ID<input name="businessAccountId" /></label>
            <label>Access token<input name="accessToken" type="password" autoComplete="off" required /></label>
            <label>App secret<input name="appSecret" type="password" autoComplete="off" required /></label>
            <label>Webhook verify token<input name="verifyToken" type="password" autoComplete="off" required /></label>
            <button type="submit">Save encrypted integration</button>
          </form>
        </section>
      ) : null}
    </AppShell>
  );
}
