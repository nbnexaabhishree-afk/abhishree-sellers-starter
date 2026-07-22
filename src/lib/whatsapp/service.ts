import crypto from "node:crypto";

import { z } from "zod";

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

const webhookEventSchema = z.object({
  object: z.string().optional(),
  entry: z.array(
    z.object({
      id: z.string().optional(),
      changes: z.array(
        z.object({
          value: z.unknown(),
          field: z.string().optional()
        })
      )
    })
  )
});

export function verifyWebhookSignature(rawBody: string, signature: string | null | undefined) {
  const validation = getWhatsAppEnvValidation();
  if (!validation.ok) {
    return false;
  }

  const env = getWhatsAppEnv();
  const expected = `sha256=${crypto.createHmac("sha256", env.WHATSAPP_APP_SECRET).update(rawBody).digest("hex")}`;
  if (!signature) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function normalizeWebhookPayload(payload: unknown) {
  const parsed = webhookEventSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

export async function sendTemplateMessage(request: TemplateMessageRequest): Promise<SendTemplateMessageResult> {
  const validation = getWhatsAppEnvValidation();
  if (!validation.ok) {
    return { ok: false, status: 500, error: "WhatsApp credentials are not configured" };
  }

  const env = getWhatsAppEnv();
  const response = await fetch(`https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: request.to,
      type: "template",
      template: {
        name: request.template.name,
        language: { code: request.template.languageCode },
        components: [
          ...(request.template.bodyParameters ? [{ type: "body", parameters: request.template.bodyParameters.map((value) => ({ type: "text", text: value })) }] : []),
          ...(request.template.headerParameters ? [{ type: "header", parameters: request.template.headerParameters.map((value) => ({ type: "text", text: value })) }] : []),
          ...(request.template.buttonParameters ? [{ type: "button", parameters: request.template.buttonParameters.map((value) => ({ type: "text", text: value })) }] : [])
        ]
      }
    }),
    signal: AbortSignal.timeout(15000)
  });

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, status: response.status, error: responseBody?.error?.message ?? "Template send failed" };
  }

  const messageId = responseBody?.messages?.[0]?.id;
  return { ok: true, status: response.status, messageId };
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
