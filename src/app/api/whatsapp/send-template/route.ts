import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  to: z.string().min(10),
  templateName: z.string().min(1),
  languageCode: z.string().default("en")
});

export async function POST(request: NextRequest) {
  const body = bodySchema.parse(await request.json());

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION ?? "v23.0";

  if (!accessToken || !phoneNumberId) {
    return NextResponse.json(
      { error: "WhatsApp credentials are not configured" },
      { status: 500 }
    );
  }

  const response = await fetch(
    `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
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
