import { NextResponse } from "next/server";
import { z } from "zod";

import { contactInputSchema, createSupabaseServiceRoleClient, normalizePhone } from "@/lib/repositories/contact-repository";

const bodySchema = z.object({
  rows: z.array(contactInputSchema),
  duplicateAction: z.enum(["skip", "replace", "merge"]).default("skip")
});

export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const client = createSupabaseServiceRoleClient();
    const summary = { totalRows: body.data.rows.length, imported: 0, skipped: 0, merged: 0, replaced: 0, invalid: 0, duplicates: 0, errors: 0 };

    for (const row of body.data.rows) {
      const normalized = normalizePhone(row.phone);
      const { data: existing, error: lookupError } = await client
        .from("contacts")
        .select("*")
        .eq("normalized_phone", normalized)
        .maybeSingle();

      if (lookupError) {
        summary.errors += 1;
        continue;
      }

      if (existing) {
        summary.duplicates += 1;
        if (body.data.duplicateAction === "skip") {
          summary.skipped += 1;
          continue;
        }

        const next = {
          ...existing,
          name: row.name ?? existing.name,
          phone: row.phone ?? existing.phone,
          normalized_phone: normalized,
          project: row.project ?? existing.project,
          sector: row.sector ?? existing.sector,
          city: row.city ?? existing.city,
          source: row.source ?? existing.source,
          status: existing.do_not_contact || row.do_not_contact ? "do_not_contact" : row.status ?? existing.status,
          do_not_contact: existing.do_not_contact || Boolean(row.do_not_contact),
          notes: row.notes ?? existing.notes,
          last_contacted_at: row.last_contacted_at ?? existing.last_contacted_at
        };

        const { error } = await client.from("contacts").update(next).eq("id", existing.id);
        if (error) {
          summary.errors += 1;
          continue;
        }
        if (body.data.duplicateAction === "replace") {
          summary.replaced += 1;
        } else {
          summary.merged += 1;
        }
        continue;
      }

      const { error } = await client.from("contacts").insert({
        name: row.name ?? null,
        phone: row.phone,
        normalized_phone: normalized,
        project: row.project ?? null,
        sector: row.sector ?? null,
        city: row.city ?? null,
        source: row.source ?? null,
        status: row.status ?? "new",
        do_not_contact: row.do_not_contact ?? false,
        notes: row.notes ?? null,
        last_contacted_at: row.last_contacted_at ?? null
      });

      if (error) {
        summary.errors += 1;
      } else {
        summary.imported += 1;
      }
    }

    return NextResponse.json(summary);
  } catch (error) {
    console.error("Contact import failed", error);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
