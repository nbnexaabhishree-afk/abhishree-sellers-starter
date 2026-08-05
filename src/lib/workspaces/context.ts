import { NextResponse } from "next/server";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type WorkspaceRole = "owner" | "admin" | "agent";

export interface WorkspaceContext {
  workspaceId: string;
  role: WorkspaceRole;
  userId: string;
}

type MembershipRow = {
  workspace_id: string;
  role: WorkspaceRole;
};

async function resolveWorkspaceContext(): Promise<WorkspaceContext | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  const membership = data as MembershipRow;
  return {
    workspaceId: membership.workspace_id,
    role: membership.role,
    userId: user.id
  };
}

export async function requireWorkspace(): Promise<WorkspaceContext> {
  const context = await resolveWorkspaceContext();
  if (!context) redirect("/onboarding");
  return context;
}

export type ApiWorkspaceResult =
  | { ok: true; context: WorkspaceContext }
  | { ok: false; response: NextResponse };

export async function requireApiWorkspace(): Promise<ApiWorkspaceResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 })
    };
  }

  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Workspace membership required" }, { status: 403 })
    };
  }

  const membership = data as MembershipRow;
  return {
    ok: true,
    context: {
      workspaceId: membership.workspace_id,
      role: membership.role,
      userId: user.id
    }
  };
}
