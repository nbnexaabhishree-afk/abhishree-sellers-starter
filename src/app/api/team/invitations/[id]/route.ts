import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiWorkspace } from "@/lib/workspaces/context";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspace = await requireApiWorkspace();
  if (!workspace.ok) return workspace.response;
  if (workspace.context.role === "agent") {
    return NextResponse.json({ error: "Owner or administrator access required" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("workspace_invitations")
    .update({ status: "revoked" })
    .eq("id", id)
    .eq("workspace_id", workspace.context.workspaceId)
    .eq("status", "pending");
  if (error) return NextResponse.json({ error: "Unable to revoke invitation" }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
