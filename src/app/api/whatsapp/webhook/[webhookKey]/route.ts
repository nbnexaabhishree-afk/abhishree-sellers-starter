import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  handleWebhookVerification,
  handleWhatsAppWebhook
} from "@/app/api/whatsapp/webhook/route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveWebhookWhatsAppIntegration } from "@/lib/whatsapp/integration";

const webhookKeySchema = z.string().uuid();

async function runtime(params: Promise<{ webhookKey: string }>) {
  const parsed = webhookKeySchema.safeParse((await params).webhookKey);
  if (!parsed.success) return null;
  return resolveWebhookWhatsAppIntegration(createSupabaseAdminClient(), parsed.data);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ webhookKey: string }> }
) {
  const integration = await runtime(params);
  if (!integration) {
    return NextResponse.json({ error: "WhatsApp integration not found" }, { status: 404 });
  }
  return handleWebhookVerification(request, integration);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ webhookKey: string }> }
) {
  const integration = await runtime(params);
  if (!integration) {
    return NextResponse.json({ error: "WhatsApp integration not found" }, { status: 404 });
  }
  return handleWhatsAppWebhook(request, integration);
}
