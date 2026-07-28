import { describe, expect, it, vi } from "vitest";

import { POST } from "./route";

describe("WhatsApp test-send route", () => {
  it("returns a JSON error for invalid payloads instead of throwing", async () => {
    vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "verify-token");
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "access-token");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "phone-id");
    vi.stubEnv("WHATSAPP_APP_SECRET", "app-secret");
    vi.stubEnv("WHATSAPP_API_VERSION", "v25.0");

    const response = await POST(new Request("http://localhost/api/whatsapp/test-send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-valid-json"
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/invalid payload|invalid json/i)
    });
  });
});
