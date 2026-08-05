import { z } from "zod";

import { getCoreEnv, getCoreEnvValidation } from "@/lib/env";
import { createClient } from "@supabase/supabase-js";

export type ContactStatus = "new" | "follow_up" | "qualified" | "won" | "lost" | "do_not_contact";

export type ContactRecord = {
  id: string;
  workspace_id: string;
  name: string | null;
  phone: string;
  normalized_phone: string;
  project: string | null;
  sector: string | null;
  city: string | null;
  source: string | null;
  status: ContactStatus;
  do_not_contact: boolean;
  notes: string | null;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ContactInput = {
  id?: string;
  name?: string | null;
  phone: string;
  project?: string | null;
  sector?: string | null;
  city?: string | null;
  source?: string | null;
  status?: ContactStatus;
  do_not_contact?: boolean;
  notes?: string | null;
  last_contacted_at?: string | null;
};

export type ImportSummary = {
  totalRows: number;
  imported: number;
  skipped: number;
  merged: number;
  replaced: number;
  invalid: number;
  duplicates: number;
  errors: number;
};

export type ContactRepository = {
  listContacts(options?: { search?: string; status?: ContactStatus | "all"; limit?: number; offset?: number }): Promise<ContactRecord[]>;
  searchContacts(query: string): Promise<ContactRecord[]>;
  getByNormalizedPhone(phone: string): Promise<ContactRecord | null>;
  createContact(input: ContactInput): Promise<ContactRecord>;
  updateContact(id: string, changes: Partial<ContactInput>): Promise<ContactRecord | null>;
  deleteContact(id: string): Promise<boolean>;
  importContacts(rows: ContactInput[], duplicateAction?: "skip" | "replace" | "merge"): Promise<ImportSummary>;
};

export const contactStatusSchema = z.enum(["new", "follow_up", "qualified", "won", "lost", "do_not_contact"]);

export const contactInputSchema = z.object({
  name: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().min(1, "Phone is required"),
  project: z.string().trim().max(200).nullable().optional(),
  sector: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(200).nullable().optional(),
  source: z.string().trim().max(200).nullable().optional(),
  status: contactStatusSchema.optional().default("new"),
  do_not_contact: z.boolean().optional().default(false),
  notes: z.string().trim().max(2000).nullable().optional(),
  last_contacted_at: z.string().nullable().optional()
});

export function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) {
    return phone.trim();
  }
  return digits.startsWith("91") ? `+${digits}` : digits;
}

export function mergeContactData(existing: ContactRecord, incoming: Partial<ContactInput> & { normalized_phone: string }, duplicateAction: "skip" | "replace" | "merge") {
  const nextStatus = existing.do_not_contact || incoming.do_not_contact ? "do_not_contact" : incoming.status ?? existing.status;
  const nextDoNotContact = existing.do_not_contact || Boolean(incoming.do_not_contact);

  const merged = {
    ...existing,
    ...incoming,
    id: existing.id,
    phone: incoming.phone ?? existing.phone,
    normalized_phone: incoming.normalized_phone ?? existing.normalized_phone,
    status: nextStatus as ContactStatus,
    do_not_contact: nextDoNotContact,
    name: incoming.name ?? existing.name,
    project: incoming.project ?? existing.project,
    sector: incoming.sector ?? existing.sector,
    city: incoming.city ?? existing.city,
    source: incoming.source ?? existing.source,
    notes: incoming.notes ?? existing.notes,
    last_contacted_at: incoming.last_contacted_at ?? existing.last_contacted_at
  };

  if (duplicateAction === "replace") {
    return merged;
  }

  if (duplicateAction === "merge") {
    return {
      ...merged,
      name: incoming.name ?? existing.name,
      project: incoming.project ?? existing.project,
      sector: incoming.sector ?? existing.sector,
      city: incoming.city ?? existing.city,
      source: incoming.source ?? existing.source,
      notes: incoming.notes ?? existing.notes,
      status: nextStatus as ContactStatus,
      do_not_contact: nextDoNotContact
    };
  }

  return existing;
}

export function buildImportSummary(overrides: Partial<ImportSummary> = {}): ImportSummary {
  return {
    totalRows: 0,
    imported: 0,
    skipped: 0,
    merged: 0,
    replaced: 0,
    invalid: 0,
    duplicates: 0,
    errors: 0,
    ...overrides
  };
}

export function getEnvValidation(env: Record<string, string | undefined> = process.env) {
  return getCoreEnvValidation(env);
}

export function createSupabaseClient() {
  const env = getCoreEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export const createSupabaseServiceRoleClient = () => {
  const env = getCoreEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
};

export class SupabaseContactRepository implements ContactRepository {
  constructor(
    private readonly client: ReturnType<typeof createSupabaseClient>,
    private readonly workspaceId: string
  ) {}

  async listContacts(options: { search?: string; status?: ContactStatus | "all"; limit?: number; offset?: number } = {}) {
    let query = this.client
      .from("contacts")
      .select("*")
      .eq("workspace_id", this.workspaceId)
      .order("created_at", { ascending: false });

    if (options.status && options.status !== "all") {
      query = query.eq("status", options.status);
    }

    if (options.search) {
      const search = options.search.trim();
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,project.ilike.%${search}%`);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit ?? 50) - 1);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error("Unable to load contacts");
    }

    return (data ?? []) as ContactRecord[];
  }

  async searchContacts(query: string) {
    return this.listContacts({ search: query, limit: 50 });
  }

  async getByNormalizedPhone(phone: string) {
    const normalized = normalizePhone(phone);
    const { data, error } = await this.client
      .from("contacts")
      .select("*")
      .eq("workspace_id", this.workspaceId)
      .eq("normalized_phone", normalized)
      .maybeSingle();
    if (error) {
      throw new Error("Unable to resolve contact");
    }
    return (data as ContactRecord | null) ?? null;
  }

  async createContact(input: ContactInput) {
    const normalized = normalizePhone(input.phone);
    const payload = {
      ...input,
      workspace_id: this.workspaceId,
      normalized_phone: normalized,
      status: input.status ?? "new",
      do_not_contact: input.do_not_contact ?? false
    };

    const { data, error } = await this.client.from("contacts").insert(payload).select().single();
    if (error) {
      throw new Error("Unable to create contact");
    }

    return data as ContactRecord;
  }

  async updateContact(id: string, changes: Partial<ContactInput>) {
    const payload = { ...changes };
    if (payload.phone) {
      payload.phone = payload.phone.trim();
      (payload as Record<string, string>).normalized_phone = normalizePhone(payload.phone);
    }

    const { data, error } = await this.client
      .from("contacts")
      .update(payload)
      .eq("workspace_id", this.workspaceId)
      .eq("id", id)
      .select()
      .single();
    if (error) {
      throw new Error("Unable to update contact");
    }

    return (data as ContactRecord | null) ?? null;
  }

  async deleteContact(id: string) {
    const { error } = await this.client
      .from("contacts")
      .delete()
      .eq("workspace_id", this.workspaceId)
      .eq("id", id);
    if (error) {
      throw new Error("Unable to delete contact");
    }
    return true;
  }

  async importContacts(rows: ContactInput[], duplicateAction: "skip" | "replace" | "merge" = "skip") {
    const summary = buildImportSummary({ totalRows: rows.length });

    for (const row of rows) {
      const parsed = contactInputSchema.safeParse(row);
      if (!parsed.success) {
        summary.invalid += 1;
        summary.errors += 1;
        continue;
      }

      const normalized = normalizePhone(parsed.data.phone);
      const existing = await this.getByNormalizedPhone(normalized);
      if (existing) {
        summary.duplicates += 1;
        if (duplicateAction === "skip") {
          summary.skipped += 1;
          continue;
        }

        const merged = mergeContactData(existing, { ...parsed.data, normalized_phone: normalized }, duplicateAction);
        if (duplicateAction === "replace") {
          summary.replaced += 1;
        } else {
          summary.merged += 1;
        }

        const { error } = await this.client
          .from("contacts")
          .update(merged)
          .eq("workspace_id", this.workspaceId)
          .eq("id", existing.id);
        if (error) {
          summary.errors += 1;
          continue;
        }
        continue;
      }

      const { error } = await this.client.from("contacts").insert({
        ...parsed.data,
        workspace_id: this.workspaceId,
        normalized_phone: normalized,
        status: parsed.data.status ?? "new",
        do_not_contact: parsed.data.do_not_contact ?? false
      });
      if (error) {
        summary.errors += 1;
      } else {
        summary.imported += 1;
      }
    }

    return summary;
  }
}
