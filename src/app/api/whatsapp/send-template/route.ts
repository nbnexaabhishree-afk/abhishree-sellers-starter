import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveWorkspaceWhatsAppIntegration } from "@/lib/whatsapp/integration";
import { sendTemplateMessage } from "@/lib/whatsapp/service";
import { requireApiWorkspace } from "@/lib/workspaces/context";
import { reserveWhatsAppMessage } from "@/lib/billing/usage";

const bodySchema = z.object({
  to: z.string().min(10),
  templateName: z.string().min(1),
  languageCode: z.string().default("en")
});

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const workspace = await requireApiWorkspace();
  if (!workspace.ok) return workspace.response;

  const admin = createSupabaseAdminClient();
  const integration = await resolveWorkspaceWhatsAppIntegration(admin, workspace.context.workspaceId);
  if (!integration) {
    return NextResponse.json(
      { error: "WhatsApp integration is not configured for this workspace" },
      { status: 409 }
    );
  }

  const usage = await reserveWhatsAppMessage(admin, workspace.context.workspaceId, request.headers.get("idempotency-key") ?? undefined);
  if (!usage.allowed) {
    return NextResponse.json({ error: "Monthly WhatsApp message limit reached", usage }, { status: 429 });
  }

  const result = await sendTemplateMessage({
    to: parsed.data.to,
    template: {
      name: parsed.data.templateName,
      languageCode: parsed.data.languageCode
    }
  }, integration.credentials);

  return NextResponse.json(result, { status: result.ok ? 200 : result.status });
}
