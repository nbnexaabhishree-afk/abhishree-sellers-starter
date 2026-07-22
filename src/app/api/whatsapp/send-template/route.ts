import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getWhatsAppEnv, getWhatsAppEnvValidation } from "@/lib/env";

const bodySchema = z.object({
  to: z.string().min(10),
  templateName: z.string().min(1),
  languageCode: z.string().default("en")
});

export async function POST(request: NextRequest) {
  const body = bodySchema.parse(await request.json());

  const whatsappValidation = getWhatsAppEnvValidation();
  if (!whatsappValidation.ok) {
    return NextResponse.json(
      { error: "WhatsApp credentials are not configured" },
      { status: 500 }
    );
  }

  const env = getWhatsAppEnv();

  const response = await fetch(
    `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: body.to,
        type: "template",
        template: {
          name: body.templateName,
          language: { code: body.languageCode }
        }
      })
    }
  );

  const result = await response.json();

  return NextResponse.json(result, { status: response.status });
}
