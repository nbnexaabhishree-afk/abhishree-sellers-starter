import { NextResponse } from "next/server";

import { getRedirectOrigin, getRedirectUrl } from "@/lib/auth/redirect-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || password.length < 8) return NextResponse.redirect(getRedirectUrl("/register?error=invalid", request.url), { status: 303 });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${getRedirectOrigin(request.url)}/auth/callback?next=/onboarding` }
  });
  if (error) return NextResponse.redirect(getRedirectUrl("/register?error=signup", request.url), { status: 303 });
  return NextResponse.redirect(getRedirectUrl(data.session ? "/onboarding" : "/login?notice=check-email", request.url), { status: 303 });
}
