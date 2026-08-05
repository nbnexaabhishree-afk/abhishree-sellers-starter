import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/workspaces/context";

const selectionSchema = z.object({
  workspaceId: z.string().uuid(),
  returnTo: z.string().startsWith("/").default("/dashboard")
});

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const input = contentType.includes("application/json")
    ? await request.json()
    : Object.fromEntries(await request.formData());
  const parsed = selectionSchema.safeParse(input);
  if (!parsed.success || parsed.data.returnTo.startsWith("//")) {
    return NextResponse.json({ error: "Invalid workspace selection" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", parsed.data.workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "Workspace membership required" }, { status: 403 });
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, parsed.data.workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365
  });

  if (contentType.includes("application/json")) {
    return NextResponse.json({ workspaceId: parsed.data.workspaceId });
  }
  return NextResponse.redirect(new URL(parsed.data.returnTo, request.url), { status: 303 });
}
