import { NextResponse } from "next/server";

import { logAuthError } from "@/lib/auth/errors";
import { getRedirectUrl } from "@/lib/auth/redirect-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();

  if (error) logAuthError("Supabase sign-out failed", error);

  return NextResponse.redirect(getRedirectUrl("/login", request.url));
}
