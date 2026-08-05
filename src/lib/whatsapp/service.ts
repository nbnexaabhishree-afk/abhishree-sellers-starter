import crypto from "node:crypto";

import { getWhatsAppEnv, getWhatsAppEnvValidation } from "@/lib/env";

export type WhatsAppDirection = "inbound" | "outbound";
export type WhatsAppMessageType = "text" | "button" | "list_reply" | "image" | "video" | "document" | "audio" | "voice" | "location" | "contacts" | "reaction" | "unsupported";
export type WhatsAppStatus = "sent" | "delivered" | "read" | "failed" | "pending";

export type TemplatePayload = {
  name: string;
  languageCode: string;
  bodyParameters?: string[];
  headerParameters?: string[];
  buttonParameters?: string[];
};

export type TemplateMessageRequest = {
  to: string;
  template: TemplatePayload;
};

export type SendTemplateMessageResult = {
  ok: boolean;
  status: number;
  messageId?: string;
  error?: string;
};

export type WhatsAppCredentials = {
  verifyToken: string;
  accessToken: string;
  phoneNumberId: string;
  businessAccountId?: string;
  appSecret: string;
  apiVersion: string;
};

export function environmentWhatsAppCredentials(): WhatsAppCredentials | null {
  const validation = getWhatsAppEnvValidation();
  if (!validation.ok) return null;
  const env = getWhatsAppEnv();
  return {
    verifyToken: env.WHATSAPP_VERIFY_TOKEN,
    accessToken: env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
    businessAccountId: env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    appSecret: env.WHATSAPP_APP_SECRET,
    apiVersion: env.WHATSAPP_API_VERSION
  };
}

type WebhookValue = Record<string, unknown>;

export type NormalizedWebhookPayload = {
  object?: string;
  entry: Array<{
    id?: string;
    changes: Array<{ field?: string; value: WebhookValue }>;
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null | undefined,
  appSecret?: string
) {
  const secret = appSecret ?? environmentWhatsAppCredentials()?.appSecret;
  if (!secret) return false;
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  if (!signature) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function normalizeWebhookPayload(payload: unknown): NormalizedWebhookPayload | null {
  if (!isRecord(payload)) return null;

  if (Array.isArray(payload.entry)) {
    const entries = payload.entry.flatMap((entry) => {
      if (!isRecord(entry) || !Array.isArray(entry.changes)) return [];
      const changes = entry.changes.flatMap((change) => {
        if (!isRecord(change) || !isRecord(change.value)) return [];
        return [{
          field: typeof change.field === "string" ? change.field : undefined,
          value: change.value
        }];
      });
      return changes.length > 0 ? [{
        id: typeof entry.id === "string" ? entry.id : undefined,
        changes
      }] : [];
    });

    if (entries.length > 0) {
      return {
        object: typeof payload.object === "string" ? payload.object : undefined,
        entry: entries
      };
    }
  }

  if (payload.field === "messages" && isRecord(payload.value)) {
    return { entry: [{ changes: [{ field: "messages", value: payload.value }] }] };
  }

  if (Array.isArray(payload.messages) || Array.isArray(payload.statuses)) {
    return { entry: [{ changes: [{ field: "messages", value: payload }] }] };
  }

  return null;
}

export function extractWebhookMessages(payload: NormalizedWebhookPayload) {
  return payload.entry.flatMap((entry) => entry.changes.flatMap((change) => {
    const messages = Array.isArray(change.value.messages) ? change.value.messages : [];
    const contacts = Array.isArray(change.value.contacts) ? change.value.contacts : [];

    return messages.flatMap((message) => {
      if (!isRecord(message)) return [];
      const sender = typeof message.from === "string" ? message.from : null;
      const matchingContact = contacts.find((contact) => isRecord(contact) && contact.wa_id === sender);
      const profile = isRecord(matchingContact) && isRecord(matchingContact.profile)
        ? matchingContact.profile
        : null;

      return [{
        message,
        profileName: profile && typeof profile.name === "string" ? profile.name : null
      }];
    });
  }));
}

export async function sendTemplateMessage(
  request: TemplateMessageRequest,
  credentials = environmentWhatsAppCredentials()
): Promise<SendTemplateMessageResult> {
  if (!credentials) {
    return { ok: false, status: 500, error: "WhatsApp credentials are not configured" };
  }
  try {
    console.log("WhatsApp test send starting");
    console.log("WhatsApp test send env", {
      tokenExists: !!process.env.WHATSAPP_ACCESS_TOKEN,
      phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID
    });

    const response = await fetch(`https://graph.facebook.com/${credentials.apiVersion}/${credentials.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: request.to,
        type: "template",
        template: {
          name: request.template.name,
          language: { code: request.template.languageCode }
        }
      }),
      signal: AbortSignal.timeout(15000)
    });

    const responseText = await response.text();
    console.log("WhatsApp API response", { status: response.status, body: responseText });

    let responseBody: Record<string, unknown> = {};
    try {
      responseBody = responseText ? JSON.parse(responseText) as Record<string, unknown> : {};
    } catch {
      responseBody = { raw: responseText };
    }

    if (!response.ok) {
      console.error("WhatsApp Meta API error", {
        status: response.status,
        body: responseBody,
        phoneNumberId: credentials.phoneNumberId
      });
      return {
        ok: false,
        status: response.status,
        error: (responseBody?.error as { message?: string } | undefined)?.message ?? "Template send failed"
      };
    }

    const messageId = typeof (responseBody?.messages as Array<{ id?: string }> | undefined)?.[0]?.id === "string"
      ? (responseBody.messages as Array<{ id?: string }>)[0].id
      : undefined;
    return { ok: true, status: response.status, messageId };
  } catch (error) {
    console.error("WhatsApp send failed", error);
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : "Template send failed"
    };
  }
}

export function normalizeWhatsAppId(value: string) {
  return value.trim().replace(/^whatsapp:/i, "").replace(/\D/g, "");
}

export function normalizeMessageBody(message: Record<string, unknown>) {
  const type = typeof message.type === "string" ? message.type : "unsupported";
  const payload = message as Record<string, Record<string, unknown>>;
  if (type === "text") {
    return typeof payload.text?.body === "string" ? payload.text.body : null;
  }
  if (type === "button") {
    return typeof payload.button?.payload === "string" ? payload.button.payload : null;
  }
  if (type === "list_reply") {
    return typeof payload.list_reply?.title === "string" ? payload.list_reply.title : null;
  }
  if (type === "interactive") {
    const interactive = payload.interactive;
    if (interactive?.type === "list_reply" && typeof interactive.list_reply === "object" && interactive.list_reply !== null) {
      return typeof (interactive.list_reply as Record<string, unknown>).title === "string"
        ? (interactive.list_reply as Record<string, unknown>).title as string
        : null;
    }
    if (interactive?.type === "button_reply" && typeof interactive.button_reply === "object" && interactive.button_reply !== null) {
      return typeof (interactive.button_reply as Record<string, unknown>).title === "string"
        ? (interactive.button_reply as Record<string, unknown>).title as string
        : null;
    }
  }
  if (type === "reaction") {
    return typeof payload.reaction?.emoji === "string" ? payload.reaction.emoji : null;
  }
  return null;
}

export function detectOptOut(body: string | null | undefined) {
  if (!body) {
    return false;
  }
  const normalized = body.toLowerCase().trim();
  const patterns = [
    "stop",
    "unsubscribe",
    "remove",
    "do not contact",
    "not interested",
    "no more messages",
    "बन्द करो",
    "मैसेज मत करो",
    "मुझे मैसेज मत करना"
  ];
  if (patterns.some((pattern) => normalized.includes(pattern))) {
    return true;
  }
  return false;
}

export function redactSecret(value: string | null | undefined) {
  if (!value) {
    return "not configured";
  }
  return `${value.slice(0, 4)}***`;
}
