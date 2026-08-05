import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiWorkspace } from "@/lib/workspaces/context";

const roleSchema = z.object({ role: z.enum(["owner", "admin", "agent"]) });

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const workspace = await requireApiWorkspace();
  if (!workspace.ok) return workspace.response;
  const parsed = roleSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  const { userId } = await params;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("manage_workspace_member", {
    target_workspace_id: workspace.context.workspaceId,
    target_user_id: userId,
    new_role: parsed.data.role,
    remove_member: false
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json({ role: parsed.data.role });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const workspace = await requireApiWorkspace();
  if (!workspace.ok) return workspace.response;
  const { userId } = await params;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("manage_workspace_member", {
    target_workspace_id: workspace.context.workspaceId,
    target_user_id: userId,
    new_role: null,
    remove_member: true
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return new NextResponse(null, { status: 204 });
}
