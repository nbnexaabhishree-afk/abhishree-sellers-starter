import { NextResponse } from "next/server";
import { z } from "zod";

import { getRedirectOrigin } from "@/lib/auth/redirect-origin";
import { createInvitationToken, hashInvitationToken } from "@/lib/security/tokens";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiWorkspace } from "@/lib/workspaces/context";

const invitationSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["admin", "agent"])
});

export async function POST(request: Request) {
  const workspace = await requireApiWorkspace();
  if (!workspace.ok) return workspace.response;
  if (workspace.context.role === "agent") {
    return NextResponse.json({ error: "Owner or administrator access required" }, { status: 403 });
  }

  const parsed = invitationSchema.safeParse(await request.json());
  if (!parsed.success || (parsed.data.role === "admin" && workspace.context.role !== "owner")) {
    return NextResponse.json({ error: "Invalid invitation or role" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const token = createInvitationToken();
  const { data, error } = await supabase
    .from("workspace_invitations")
    .insert({
      workspace_id: workspace.context.workspaceId,
      email: parsed.data.email,
      role: parsed.data.role,
      token_hash: hashInvitationToken(token),
      invited_by: workspace.context.userId
    })
    .select("id, expires_at")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.code === "23505" ? "A pending invitation already exists" : "Unable to create invitation" },
      { status: error.code === "23505" ? 409 : 500 }
    );
  }

  const acceptPath = `/invite/accept?token=${encodeURIComponent(token)}`;
  const inviteUrl = new URL(acceptPath, getRedirectOrigin(request.url)).toString();
  let emailDelivered = true;
  try {
    const admin = createSupabaseAdminClient();
    const redirectTo = new URL(`/auth/callback?next=${encodeURIComponent(acceptPath)}`, getRedirectOrigin(request.url)).toString();
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, { redirectTo });
    emailDelivered = !inviteError;
  } catch {
    emailDelivered = false;
  }

  return NextResponse.json({ id: data.id, expiresAt: data.expires_at, inviteUrl, emailDelivered }, { status: 201 });
}
