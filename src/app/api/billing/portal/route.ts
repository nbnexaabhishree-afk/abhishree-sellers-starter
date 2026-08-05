import { NextResponse } from "next/server";

import { getRedirectOrigin } from "@/lib/auth/redirect-origin";
import { createStripeClient } from "@/lib/billing/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireApiWorkspace } from "@/lib/workspaces/context";

export async function POST(request: Request) {
  const workspace = await requireApiWorkspace();
  if (!workspace.ok) return workspace.response;
  if (workspace.context.role !== "owner") return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("workspace_subscriptions").select("stripe_customer_id").eq("workspace_id", workspace.context.workspaceId).single();
  if (!data?.stripe_customer_id) return NextResponse.json({ error: "No Stripe customer exists for this workspace" }, { status: 409 });
  try {
    const session = await createStripeClient().billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${getRedirectOrigin(request.url)}/billing`
    });
    return NextResponse.redirect(session.url, { status: 303 });
  } catch {
    return NextResponse.json({ error: "Customer portal is unavailable" }, { status: 503 });
  }
}
