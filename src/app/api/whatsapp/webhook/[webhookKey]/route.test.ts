import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveWebhookWhatsAppIntegration } from "@/lib/whatsapp/integration";
import { GET, POST } from "./route";

const handleVerification = vi.fn();
const handlePost = vi.fn();

vi.mock("@/app/api/whatsapp/webhook/route", () => ({
  handleWebhookVerification: (...args: unknown[]) => handleVerification(...args),
  handleWhatsAppWebhook: (...args: unknown[]) => handlePost(...args)
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({}))
}));
vi.mock("@/lib/whatsapp/integration", () => ({
  resolveWebhookWhatsAppIntegration: vi.fn()
}));

const resolveMock = vi.mocked(resolveWebhookWhatsAppIntegration);
const key = "00000000-0000-4000-8000-000000000202";
const runtime = {
  integrationId: "integration-2",
  workspaceId: "workspace-2",
  workspaceName: "Workspace Two",
  webhookKey: key,
  credentials: {
    verifyToken: "verify-token",
    accessToken: "access-token",
    phoneNumberId: "phone-id",
    appSecret: "app-secret",
    apiVersion: "v25.0"
  }
};

describe("workspace-keyed WhatsApp webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleVerification.mockResolvedValue(Response.json({ ok: true }));
    handlePost.mockResolvedValue(Response.json({ ok: true }));
  });

  it("returns 404 for unknown webhook keys", async () => {
    resolveMock.mockResolvedValue(null);

    const response = await POST(
      new NextRequest(`http://localhost/api/whatsapp/webhook/${key}`, { method: "POST" }),
      { params: Promise.resolve({ webhookKey: key }) }
    );

    expect(response.status).toBe(404);
    expect(handlePost).not.toHaveBeenCalled();
  });

  it("passes the resolved tenant runtime to verification and processing", async () => {
    resolveMock.mockResolvedValue(runtime);
    const getRequest = new NextRequest(`http://localhost/api/whatsapp/webhook/${key}`);
    const postRequest = new NextRequest(`http://localhost/api/whatsapp/webhook/${key}`, { method: "POST" });

    await GET(getRequest, { params: Promise.resolve({ webhookKey: key }) });
    await POST(postRequest, { params: Promise.resolve({ webhookKey: key }) });

    expect(handleVerification).toHaveBeenCalledWith(getRequest, runtime);
    expect(handlePost).toHaveBeenCalledWith(postRequest, runtime);
  });
});
