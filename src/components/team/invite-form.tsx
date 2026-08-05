"use client";

import { FormEvent, useState } from "react";

export function InviteForm({ canInviteAdmins }: { canInviteAdmins: boolean }) {
  const [result, setResult] = useState<{ inviteUrl?: string; emailDelivered?: boolean; error?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setResult(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/team/invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), role: form.get("role") })
    });
    const body = await response.json();
    setResult(response.ok ? body : { error: body.error ?? "Unable to create invitation" });
    setSubmitting(false);
    if (response.ok) event.currentTarget.reset();
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <label>Email<input name="email" type="email" required /></label>
      <label>
        Role
        <select name="role" defaultValue="agent">
          <option value="agent">Agent</option>
          {canInviteAdmins ? <option value="admin">Administrator</option> : null}
        </select>
      </label>
      <button type="submit" disabled={submitting}>{submitting ? "Inviting…" : "Invite member"}</button>
      {result?.error ? <p className="error-message" role="alert">{result.error}</p> : null}
      {result?.inviteUrl ? (
        <div className="notice">
          <strong>{result.emailDelivered ? "Invitation email sent." : "Email delivery was unavailable."}</strong>
          <p>Copy this one-time link if the recipient does not receive email:</p>
          <a href={result.inviteUrl}>{result.inviteUrl}</a>
        </div>
      ) : null}
    </form>
  );
}
