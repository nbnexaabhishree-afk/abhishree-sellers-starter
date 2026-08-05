import { NextResponse } from "next/server";

import { logAuthError } from "@/lib/auth/errors";
import { getRedirectUrl } from "@/lib/auth/redirect-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const requestedNext = String(formData.get("next") ?? "/dashboard");
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/dashboard";

  if (!email || !password) {
    return NextResponse.redirect(getRedirectUrl("/login?error=missing", request.url));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    logAuthError("Supabase password sign-in failed", error);
    return NextResponse.redirect(getRedirectUrl("/login?error=invalid", request.url));
  }

  return NextResponse.redirect(getRedirectUrl(next, request.url));
}
