import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { encryptIntegrationSecret } from "@/lib/whatsapp/integration";
import { requireApiWorkspace } from "@/lib/workspaces/context";

const integrationSchema = z.object({
  apiVersion: z.string().trim().regex(/^v\d+(?:\.\d+)?$/),
  phoneNumberId: z.string().trim().min(1).max(100),
  businessAccountId: z.string().trim().max(100).optional().default(""),
  accessToken: z.string().trim().min(10),
  appSecret: z.string().trim().min(8),
  verifyToken: z.string().trim().min(8)
});

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  let input: unknown;
  try {
    input = contentType.includes("application/json")
      ? await request.json()
      : Object.fromEntries(await request.formData());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsed = integrationSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid WhatsApp integration details" }, { status: 400 });
  }

  const workspace = await requireApiWorkspace();
  if (!workspace.ok) return workspace.response;
  if (!(["owner", "admin"] as const).includes(workspace.context.role as "owner" | "admin")) {
    return NextResponse.json({ error: "Workspace administrator access required" }, { status: 403 });
  }

  let encryptedSecrets;
  try {
    encryptedSecrets = {
      access_token_ciphertext: encryptIntegrationSecret(parsed.data.accessToken),
      app_secret_ciphertext: encryptIntegrationSecret(parsed.data.appSecret),
      verify_token_ciphertext: encryptIntegrationSecret(parsed.data.verifyToken)
    };
  } catch {
    return NextResponse.json({ error: "Credential encryption is not configured" }, { status: 500 });
  }

  const client = createSupabaseAdminClient();
  const { data: integration, error: integrationError } = await client
    .from("whatsapp_integrations")
    .select("id, webhook_key")
    .eq("workspace_id", workspace.context.workspaceId)
    .single();
  if (integrationError || !integration) {
    return NextResponse.json({ error: "Workspace integration record is unavailable" }, { status: 500 });
  }

  const { error: secretError } = await client
    .from("whatsapp_integration_secrets")
    .upsert({ integration_id: integration.id, ...encryptedSecrets }, { onConflict: "integration_id" });
  if (secretError) {
    return NextResponse.json({ error: "Unable to store encrypted credentials" }, { status: 500 });
  }

  const { error: updateError } = await client
    .from("whatsapp_integrations")
    .update({
      status: "active",
      credentials_mode: "encrypted",
      api_version: parsed.data.apiVersion,
      phone_number_id: parsed.data.phoneNumberId,
      business_account_id: parsed.data.businessAccountId || null
    })
    .eq("workspace_id", workspace.context.workspaceId);
  if (updateError) {
    return NextResponse.json({ error: "Unable to activate WhatsApp integration" }, { status: 500 });
  }

  const webhookUrl = new URL(`/api/whatsapp/webhook/${integration.webhook_key}`, request.url).toString();
  if (contentType.includes("application/json")) {
    return NextResponse.json({ ok: true, webhookUrl });
  }
  return NextResponse.redirect(new URL("/settings", request.url), { status: 303 });
}
