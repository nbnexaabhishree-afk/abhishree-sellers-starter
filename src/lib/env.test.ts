import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAuthEnv, getCoreEnv, getWhatsAppEnvValidation } from "./env";
import { createSupabaseAdminClient } from "./supabase/admin";
import { createSupabaseServerClient } from "./supabase/server";
import { sendTemplateMessage } from "./whatsapp/service";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: () => [],
    set: vi.fn(),
    setAll: vi.fn()
  }))
}));

describe("environment validation", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("core environment succeeds without WhatsApp variables", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");

    expect(() => getCoreEnv()).not.toThrow();
  });

  it("authentication requires neither service-role nor WhatsApp credentials", () => {
    expect(() => getAuthEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_test"
    })).not.toThrow();
  });

  it("rejects Supabase API paths instead of the project origin", () => {
    expect(() => getAuthEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co/rest/v1/",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_test"
    })).toThrow(/project origin/);
  });

  it("WhatsApp environment reports incomplete when values are empty", () => {
    vi.stubEnv("WHATSAPP_VERIFY_TOKEN", " ");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", " ");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", " ");
    vi.stubEnv("WHATSAPP_BUSINESS_ACCOUNT_ID", " ");
    vi.stubEnv("WHATSAPP_APP_SECRET", " ");
    vi.stubEnv("WHATSAPP_API_VERSION", " ");

    const validation = getWhatsAppEnvValidation();
    expect(validation.ok).toBe(false);
    expect(validation.missing).toEqual(expect.arrayContaining([
      "WHATSAPP_VERIFY_TOKEN",
      "WHATSAPP_ACCESS_TOKEN",
      "WHATSAPP_PHONE_NUMBER_ID",
      "WHATSAPP_APP_SECRET"
    ]));
  });

  it("login and dashboard server clients do not require WhatsApp variables", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");

    await expect(createSupabaseServerClient()).resolves.toBeDefined();
    expect(() => createSupabaseAdminClient()).not.toThrow();
  });

  it("send service rejects missing WhatsApp credentials safely", async () => {
    const result = await sendTemplateMessage({
      to: "919876543210",
      template: {
        name: "welcome",
        languageCode: "en"
      }
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not configured|credentials/i);
  });
});
