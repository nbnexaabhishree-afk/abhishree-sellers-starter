import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function reserveWhatsAppMessage(
  supabase: SupabaseClient,
  workspaceId: string,
  idempotencyKey: string = randomUUID()
) {
  const { data, error } = await supabase.rpc("record_workspace_usage", {
    target_workspace_id: workspaceId,
    usage_metric: "whatsapp_message",
    usage_idempotency_key: `whatsapp-message:${idempotencyKey}`,
    usage_quantity: 1,
    usage_metadata: {}
  });
  if (error) throw new Error("Usage could not be recorded");
  return data as { allowed: boolean; used?: number; limit?: number; plan?: string; duplicate?: boolean };
}
