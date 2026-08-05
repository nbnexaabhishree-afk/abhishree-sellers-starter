import { AppShell } from "@/components/layout/app-shell";
import { InviteForm } from "@/components/team/invite-form";
import { MemberActions } from "@/components/team/member-actions";
import { requireUser } from "@/lib/auth/require-user";
import { requireWorkspace } from "@/lib/workspaces/context";

export default async function TeamPage() {
  const { supabase } = await requireUser();
  const workspace = await requireWorkspace();
  const [{ data: members }, { data: invitations }] = await Promise.all([
    supabase
      .from("workspace_members")
      .select("user_id, email, role, created_at")
      .eq("workspace_id", workspace.workspaceId)
      .order("created_at"),
    supabase
      .from("workspace_invitations")
      .select("id, email, role, status, expires_at, created_at")
      .eq("workspace_id", workspace.workspaceId)
      .order("created_at", { ascending: false })
  ]);

  return (
    <AppShell workspace={workspace} title="Team" subtitle="Invite teammates and control workspace access.">
      <section className="card">
        <h3>Members</h3>
        <ul className="stack-list">
          {(members ?? []).map((member) => (
            <li key={member.user_id}>
              <div><strong>{member.email ?? member.user_id}</strong><p className="muted">Joined {new Date(member.created_at).toLocaleDateString()}</p></div>
              <div className="member-actions"><span className="pill">{member.role}</span>{member.user_id !== workspace.userId && (workspace.role === "owner" || (workspace.role === "admin" && member.role === "agent")) ? <MemberActions userId={member.user_id} currentRole={member.role} canPromote={workspace.role === "owner"} /> : null}</div>
            </li>
          ))}
        </ul>
      </section>

      {workspace.role !== "agent" ? (
        <section className="card">
          <h3>Invite a teammate</h3>
          <p className="muted">Invitations expire after seven days. Administrators can invite agents; owners can also invite administrators.</p>
          <InviteForm canInviteAdmins={workspace.role === "owner"} />
        </section>
      ) : null}

      <section className="card">
        <h3>Invitation history</h3>
        {(invitations?.length ?? 0) > 0 ? (
          <ul className="stack-list">
            {invitations?.map((invitation) => (
              <li key={invitation.id}>
                <div><strong>{invitation.email}</strong><p className="muted">Expires {new Date(invitation.expires_at).toLocaleDateString()}</p></div>
                <span className="pill">{invitation.role} · {invitation.status}</span>
              </li>
            ))}
          </ul>
        ) : <p className="muted">No invitations yet.</p>}
      </section>
    </AppShell>
  );
}
