import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendTemplateMessage } from "@/lib/whatsapp/service";

const bodySchema = z.object({
  to: z.string().trim().min(1),
  templateName: z.string().trim().min(1),
  languageCode: z.string().trim().default("en"),
  bodyParameters: z.string().optional()
});

export async function POST(request: Request) {
  try {
    console.log("WhatsApp test send starting");
    console.log("WhatsApp test send env", {
      tokenExists: !!process.env.WHATSAPP_ACCESS_TOKEN,
      phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID
    });

    let parsed;
    try {
      parsed = bodySchema.safeParse(await request.json());
    } catch (error) {
      console.error("WhatsApp test send invalid JSON", error);
      return NextResponse.json({ ok: false, error: "Invalid JSON payload", details: error instanceof Error ? error.message : "Request body was not valid JSON" }, { status: 400 });
    }

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid payload", details: parsed.error.issues.map((issue) => issue.message).join(", ") }, { status: 400 });
    }

    const to = parsed.data.to.replace(/\D/g, "");
    if (!to || to.length < 8) {
      return NextResponse.json({ ok: false, error: "Invalid recipient", details: "Recipient must contain at least 8 digits" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: contact } = await supabase.from("contacts").select("*").eq("normalized_phone", to).maybeSingle();
    if (contact?.do_not_contact) {
      return NextResponse.json({ ok: false, error: "Contact is opted out", details: "Recipient is currently opted out" }, { status: 403 });
    }

    const result = await sendTemplateMessage({
      to,
      template: { name: parsed.data.templateName, languageCode: parsed.data.languageCode, bodyParameters: parsed.data.bodyParameters?.split(",").map((value) => value.trim()).filter(Boolean) }
    });

    await supabase.from("messages").insert({
      direction: "outbound",
      message_type: "template",
      body: parsed.data.templateName,
      status: result.ok ? "sent" : "failed",
      template_name: parsed.data.templateName,
      raw_payload: result,
      whatsapp_message_id: result.messageId ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error ?? "WhatsApp send failed", details: `Meta API returned status ${result.status}` }, { status: result.status >= 400 ? result.status : 500 });
    }

    return NextResponse.json({ ok: true, status: result.status, messageId: result.messageId });
  } catch (error) {
    console.error("WhatsApp test send exception", error);
    return NextResponse.json({ ok: false, error: "Unhandled WhatsApp test send error", details: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
