import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServiceRoleClient } from "@/lib/repositories/contact-repository";

const patchSchema = z.object({
  name: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().min(1).optional(),
  project: z.string().trim().max(200).nullable().optional(),
  sector: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(200).nullable().optional(),
  source: z.string().trim().max(200).nullable().optional(),
  status: z.enum(["new", "follow_up", "qualified", "won", "lost", "do_not_contact"]).optional(),
  do_not_contact: z.boolean().optional(),
  notes: z.string().trim().max(2000).nullable().optional()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const client = createSupabaseServiceRoleClient();
    const payload = { ...parsed.data };
    if (payload.phone) {
      Object.assign(payload, { normalized_phone: payload.phone.replace(/\D/g, "") });
    }

    const { data, error } = await client.from("contacts").update(payload).eq("id", id).select().single();
    if (error) {
      return NextResponse.json({ error: "Unable to update contact" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Contact update failed", error);
    return NextResponse.json({ error: "Unable to update contact" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const client = createSupabaseServiceRoleClient();
    const { error } = await client.from("contacts").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: "Unable to delete contact" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Contact delete failed", error);
    return NextResponse.json({ error: "Unable to delete contact" }, { status: 500 });
  }
}
