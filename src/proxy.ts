import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getRedirectUrl } from "@/lib/auth/redirect-origin";
import { getAuthEnv } from "@/lib/env";

const protectedRoutes = [
  "/dashboard",
  "/onboarding",
  "/contacts",
  "/settings",
  "/campaigns",
  "/inbox",
  "/enquiries"
];

function matches(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function redirectWithCookies(path: string, request: NextRequest, response: NextResponse) {
  const redirectResponse = NextResponse.redirect(getRedirectUrl(path, request.url));
  response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
  return redirectResponse;
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = getAuthEnv();
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;
  const isProtected = protectedRoutes.some((route) => matches(pathname, route));

  if (isProtected && !user) return redirectWithCookies("/login", request, response);
  if (pathname === "/login" && user) return redirectWithCookies("/dashboard", request, response);

  return response;
}

export const config = {
  matcher: [
    "/login",
    "/dashboard/:path*",
    "/onboarding/:path*",
    "/contacts/:path*",
    "/settings/:path*",
    "/campaigns/:path*",
    "/inbox/:path*",
    "/enquiries/:path*"
  ]
};
