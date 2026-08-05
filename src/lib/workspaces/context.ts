import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const ACTIVE_WORKSPACE_COOKIE = "seller_saas_workspace";

export type WorkspaceRole = "owner" | "admin" | "agent";

export interface WorkspaceMembership {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  role: WorkspaceRole;
}

export interface ApiWorkspaceContext {
  workspaceId: string;
  role: WorkspaceRole;
  userId: string;
}

export interface WorkspaceContext extends ApiWorkspaceContext, WorkspaceMembership {
  userId: string;
  memberships: WorkspaceMembership[];
}

type MembershipRow = {
  workspace_id: string;
  role: WorkspaceRole;
  workspaces: { name: string; slug: string } | { name: string; slug: string }[];
};

function toMembership(row: MembershipRow): WorkspaceMembership {
  const workspace = Array.isArray(row.workspaces) ? row.workspaces[0] : row.workspaces;
  return {
    workspaceId: row.workspace_id,
    workspaceName: workspace.name,
    workspaceSlug: workspace.slug,
    role: row.role
  };
}

async function resolveWorkspaceContext(): Promise<WorkspaceContext | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces!inner(name, slug)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error || !data?.length) return null;
  const memberships = (data as MembershipRow[]).map(toMembership);
  const cookieStore = await cookies();
  const selectedId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const selected = memberships.find((membership) => membership.workspaceId === selectedId)
    ?? memberships[0];

  return { ...selected, userId: user.id, memberships };
}

export async function requireWorkspace(): Promise<WorkspaceContext> {
  const context = await resolveWorkspaceContext();
  if (!context) redirect("/onboarding");
  return context;
}

export type ApiWorkspaceResult =
  | { ok: true; context: ApiWorkspaceContext }
  | { ok: false; response: NextResponse };

export async function requireApiWorkspace(): Promise<ApiWorkspaceResult> {
  const context = await resolveWorkspaceContext();
  if (context) {
    return {
      ok: true,
      context: { workspaceId: context.workspaceId, role: context.role, userId: context.userId }
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return {
    ok: false,
    response: NextResponse.json(
      { error: user ? "Workspace membership required" : "Authentication required" },
      { status: user ? 403 : 401 }
    )
  };
}
