import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveWorkspaceWhatsAppIntegration } from "@/lib/whatsapp/integration";
import { sendTemplateMessage } from "@/lib/whatsapp/service";
import { requireApiWorkspace } from "@/lib/workspaces/context";

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

  const integration = await resolveWorkspaceWhatsAppIntegration(
    createSupabaseAdminClient(),
    workspace.context.workspaceId
  );
  if (!integration) {
    return NextResponse.json(
      { error: "WhatsApp integration is not configured for this workspace" },
      { status: 409 }
    );
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
