"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MemberActions({ userId, currentRole, canPromote }: { userId: string; currentRole: string; canPromote: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(method: "PATCH" | "DELETE", role?: string) {
    setBusy(true); setError(null);
    const response = await fetch(`/api/team/members/${userId}`, {
      method,
      headers: role ? { "content-type": "application/json" } : undefined,
      body: role ? JSON.stringify({ role }) : undefined
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Unable to update member");
    } else router.refresh();
    setBusy(false);
  }

  return (
    <div className="member-actions">
      {canPromote ? (
        <select disabled={busy} value={currentRole} onChange={(event) => update("PATCH", event.target.value)} aria-label="Member role">
          <option value="agent">Agent</option><option value="admin">Administrator</option><option value="owner">Owner</option>
        </select>
      ) : null}
      <button disabled={busy} className="button-danger" type="button" onClick={() => update("DELETE")}>Remove</button>
      {error ? <small className="error-message">{error}</small> : null}
    </div>
  );
}
