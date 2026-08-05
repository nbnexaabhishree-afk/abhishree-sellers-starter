import { describe, expect, it } from "vitest";

import { buildImportSummary, getEnvValidation, mergeContactData, normalizePhone } from "./contact-repository";

describe("contact repository helpers", () => {
  it("normalizes phone numbers consistently", () => {
    expect(normalizePhone("+91 98765 43210")).toBe("+919876543210");
    expect(normalizePhone("  9876543210  ")).toBe("9876543210");
  });

  it("preserves do not contact when merging duplicate contacts", () => {
    const existing = {
      id: "1",
      workspace_id: "workspace-1",
      name: "Asha",
      phone: "9876543210",
      normalized_phone: "9876543210",
      project: null,
      sector: null,
      city: null,
      source: null,
      status: "do_not_contact" as const,
      do_not_contact: true,
      notes: null,
      last_contacted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const incoming = {
      name: "Asha",
      phone: "9876543210",
      normalized_phone: "9876543210",
      project: "Golf Hills",
      sector: null,
      city: null,
      source: "csv",
      status: "new" as const,
      do_not_contact: false,
      notes: "updated",
      last_contacted_at: null
    };

    const merged = mergeContactData(existing, incoming, "merge");
    expect(merged.do_not_contact).toBe(true);
    expect(merged.status).toBe("do_not_contact");
    expect(merged.project).toBe("Golf Hills");
  });

  it("summarizes import results clearly", () => {
    const summary = buildImportSummary({
      totalRows: 5,
      imported: 2,
      skipped: 1,
      merged: 1,
      replaced: 0,
      invalid: 1,
      duplicates: 0,
      errors: 0
    });

    expect(summary).toMatchObject({
      totalRows: 5,
      imported: 2,
      skipped: 1,
      merged: 1,
      replaced: 0,
      invalid: 1,
      duplicates: 0,
      errors: 0
    });
  });

  it("reports missing environment variables", () => {
    const validation = getEnvValidation({});
    expect(validation.ok).toBe(false);
    expect(validation.missing).toEqual(expect.arrayContaining(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]));
  });
});
