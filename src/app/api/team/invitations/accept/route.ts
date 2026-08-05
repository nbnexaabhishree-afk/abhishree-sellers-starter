import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getRedirectUrl } from "@/lib/auth/redirect-origin";
import { hashInvitationToken } from "@/lib/security/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/workspaces/context";

export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  if (token.length < 32 || token.length > 200) {
    return NextResponse.redirect(getRedirectUrl("/invite/accept?error=invalid", request.url), { status: 303 });
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("accept_workspace_invitation", {
    invitation_token_hash: hashInvitationToken(token)
  });
  if (error || !data) {
    return NextResponse.redirect(getRedirectUrl(`/invite/accept?token=${encodeURIComponent(token)}&error=invalid`, request.url), { status: 303 });
  }
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, String(data), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365
  });
  return NextResponse.redirect(getRedirectUrl("/dashboard", request.url), { status: 303 });
}
