import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return NextResponse.redirect(new URL("/login?error=missing", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"));
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    return NextResponse.redirect(new URL("/login?error=invalid", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"));
  }

  const response = NextResponse.redirect(new URL("/dashboard", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"));
  response.cookies.set({
    name: "sb-access-token",
    value: data.session.access_token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });
  response.cookies.set({
    name: "sb-refresh-token",
    value: data.session.refresh_token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });

  return response;
}
