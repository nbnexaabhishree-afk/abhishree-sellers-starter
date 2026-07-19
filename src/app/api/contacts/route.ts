import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServiceRoleClient } from "@/lib/repositories/contact-repository";

const bodySchema = z.object({
  name: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().min(1),
  project: z.string().trim().max(200).nullable().optional(),
  sector: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(200).nullable().optional(),
  source: z.string().trim().max(200).nullable().optional(),
  status: z.enum(["new", "follow_up", "qualified", "won", "lost", "do_not_contact"]).optional().default("new"),
  do_not_contact: z.boolean().optional().default(false),
  notes: z.string().trim().max(2000).nullable().optional()
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const client = createSupabaseServiceRoleClient();
    const normalizedPhone = parsed.data.phone.replace(/\D/g, "");
    const { data: existing } = await client.from("contacts").select("*").eq("normalized_phone", normalizedPhone).maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "Duplicate contact" }, { status: 409 });
    }

    const { data, error } = await client.from("contacts").insert({
      ...parsed.data,
      normalized_phone: normalizedPhone,
      status: parsed.data.status ?? "new",
      do_not_contact: parsed.data.do_not_contact ?? false
    }).select().single();

    if (error) {
      return NextResponse.json({ error: "Unable to create contact" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Contact create failed", error);
    return NextResponse.json({ error: "Unable to create contact" }, { status: 500 });
  }
}
