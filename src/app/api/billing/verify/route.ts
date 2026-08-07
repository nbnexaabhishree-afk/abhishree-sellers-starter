import { NextResponse } from "next/server";
import { z } from "zod";

import { fetchRazorpaySubscription, verifyRazorpayCheckoutSignature } from "@/lib/billing/razorpay";
import { syncRazorpaySubscription } from "@/lib/billing/razorpay-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireApiWorkspace } from "@/lib/workspaces/context";

const schema = z.object({
  razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  razorpay_subscription_id: z.string().regex(/^sub_[A-Za-z0-9]+$/),
  razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/i)
});

export async function POST(request: Request) {
  const workspace = await requireApiWorkspace();
  if (!workspace.ok) return workspace.response;
  if (workspace.context.role !== "owner") return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Razorpay response" }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("workspace_subscriptions")
    .select("razorpay_subscription_id")
    .eq("workspace_id", workspace.context.workspaceId)
    .single();
  if (data?.razorpay_subscription_id !== parsed.data.razorpay_subscription_id) {
    return NextResponse.json({ error: "Subscription does not belong to this workspace" }, { status: 403 });
  }
  if (!verifyRazorpayCheckoutSignature(
    parsed.data.razorpay_payment_id,
    parsed.data.razorpay_subscription_id,
    parsed.data.razorpay_signature
  )) {
    return NextResponse.json({ error: "Invalid Razorpay signature" }, { status: 400 });
  }

  try {
    const subscription = await fetchRazorpaySubscription(parsed.data.razorpay_subscription_id);
    const synced = await syncRazorpaySubscription(admin, subscription, workspace.context.workspaceId);
    return NextResponse.json({ ok: true, status: synced.status, plan: synced.plan });
  } catch {
    return NextResponse.json({ error: "Payment was signed but subscription status could not be confirmed" }, { status: 503 });
  }
}
