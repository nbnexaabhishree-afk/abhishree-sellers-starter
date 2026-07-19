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
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const to = parsed.data.to.replace(/\D/g, "");
  if (!to || to.length < 8) {
    return NextResponse.json({ error: "Invalid recipient" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: contact } = await supabase.from("contacts").select("*").eq("normalized_phone", to).maybeSingle();
  if (contact?.do_not_contact) {
    return NextResponse.json({ error: "Contact is opted out" }, { status: 403 });
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

  return NextResponse.json(result);
}
