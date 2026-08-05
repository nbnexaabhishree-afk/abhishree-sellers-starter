import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { getIntegrationEncryptionKey } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ABHISHREE_WORKSPACE_ID } from "@/lib/workspaces/constants";
import { environmentWhatsAppCredentials, WhatsAppCredentials } from "./service";

const CIPHER = "aes-256-gcm";

function encryptionKey(value = getIntegrationEncryptionKey()): Buffer {
  const hex = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, "hex") : null;
  const key = hex ?? Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error("WHATSAPP_CREDENTIALS_ENCRYPTION_KEY must encode exactly 32 bytes");
  }
  return key;
}

export function encryptIntegrationSecret(value: string, keyValue?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(CIPHER, encryptionKey(keyValue), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptIntegrationSecret(value: string, keyValue?: string): string {
  const [version, ivValue, tagValue, encryptedValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Unsupported encrypted credential format");
  }
  const decipher = createDecipheriv(CIPHER, encryptionKey(keyValue), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

type IntegrationRow = {
  id: string;
  workspace_id: string;
  status: "active" | "disabled" | "error";
  credentials_mode: "environment" | "encrypted";
  api_version: string | null;
  phone_number_id: string | null;
  business_account_id: string | null;
  webhook_key: string;
};

type SecretRow = {
  access_token_ciphertext: string;
  app_secret_ciphertext: string;
  verify_token_ciphertext: string;
};

export type ResolvedWhatsAppIntegration = {
  integrationId: string;
  workspaceId: string;
  workspaceName: string;
  webhookKey: string;
  credentials: WhatsAppCredentials;
};

async function resolveCredentials(
  client: ReturnType<typeof createSupabaseAdminClient>,
  integration: IntegrationRow
): Promise<WhatsAppCredentials | null> {
  if (integration.status !== "active") return null;
  if (integration.credentials_mode === "environment") {
    return integration.workspace_id === ABHISHREE_WORKSPACE_ID
      ? environmentWhatsAppCredentials()
      : null;
  }
  if (!integration.api_version || !integration.phone_number_id) return null;

  const { data, error } = await client
    .from("whatsapp_integration_secrets")
    .select("access_token_ciphertext, app_secret_ciphertext, verify_token_ciphertext")
    .eq("integration_id", integration.id)
    .maybeSingle();
  if (error || !data) return null;

  try {
    const secrets = data as SecretRow;
    return {
      verifyToken: decryptIntegrationSecret(secrets.verify_token_ciphertext),
      accessToken: decryptIntegrationSecret(secrets.access_token_ciphertext),
      phoneNumberId: integration.phone_number_id,
      businessAccountId: integration.business_account_id ?? undefined,
      appSecret: decryptIntegrationSecret(secrets.app_secret_ciphertext),
      apiVersion: integration.api_version
    };
  } catch {
    return null;
  }
}

async function resolveIntegration(
  client: ReturnType<typeof createSupabaseAdminClient>,
  column: "workspace_id" | "webhook_key",
  value: string
): Promise<ResolvedWhatsAppIntegration | null> {
  const { data, error } = await client
    .from("whatsapp_integrations")
    .select("id, workspace_id, status, credentials_mode, api_version, phone_number_id, business_account_id, webhook_key")
    .eq(column, value)
    .maybeSingle();
  if (error || !data) return null;
  const integration = data as IntegrationRow;
  const credentials = await resolveCredentials(client, integration);
  if (!credentials) return null;
  const { data: workspace, error: workspaceError } = await client
    .from("workspaces")
    .select("name")
    .eq("id", integration.workspace_id)
    .maybeSingle();
  if (workspaceError || !workspace || typeof workspace.name !== "string") return null;
  return {
    integrationId: integration.id,
    workspaceId: integration.workspace_id,
    workspaceName: workspace.name,
    webhookKey: integration.webhook_key,
    credentials
  };
}

export function resolveWorkspaceWhatsAppIntegration(
  client: ReturnType<typeof createSupabaseAdminClient>,
  workspaceId: string
) {
  return resolveIntegration(client, "workspace_id", workspaceId);
}

export function resolveWebhookWhatsAppIntegration(
  client: ReturnType<typeof createSupabaseAdminClient>,
  webhookKey: string
) {
  return resolveIntegration(client, "webhook_key", webhookKey);
}
