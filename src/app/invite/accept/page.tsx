import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AcceptInvitationPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  if (!token) redirect("/login");
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/accept?token=${token}`)}`);

  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="eyebrow">Team invitation</p>
        <h1>Join the workspace</h1>
        <p className="muted">You are signed in as {user.email}. Accepting adds only this account to the invited workspace.</p>
        {error ? <p className="error-message" role="alert">The invitation is invalid, expired, or belongs to another email.</p> : null}
        <form action="/api/team/invitations/accept" method="post">
          <input type="hidden" name="token" value={token} />
          <button type="submit">Accept invitation</button>
        </form>
      </div>
    </main>
  );
}
