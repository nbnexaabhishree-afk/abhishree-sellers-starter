import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { encryptIntegrationSecret } from "@/lib/whatsapp/integration";
import { requireApiWorkspace } from "@/lib/workspaces/context";
import { POST } from "./route";

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/whatsapp/integration", () => ({
  encryptIntegrationSecret: vi.fn((value: string) => `ciphertext:${value.length}`)
}));
vi.mock("@/lib/workspaces/context", () => ({ requireApiWorkspace: vi.fn() }));

const adminMock = vi.mocked(createSupabaseAdminClient);
const encryptMock = vi.mocked(encryptIntegrationSecret);
const workspaceMock = vi.mocked(requireApiWorkspace);

const input = {
  apiVersion: "v25.0",
  phoneNumberId: "phone-id-2",
  businessAccountId: "business-id-2",
  accessToken: "tenant-access-token",
  appSecret: "tenant-app-secret",
  verifyToken: "tenant-verify-token"
};

function request() {
  return new Request("http://localhost:3000/api/whatsapp/integration", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
}

describe("workspace WhatsApp integration setup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks agents from changing credentials", async () => {
    workspaceMock.mockResolvedValue({
      ok: true,
      context: { workspaceId: "workspace-2", userId: "user-2", role: "agent" }
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(adminMock).not.toHaveBeenCalled();
  });

  it("stores ciphertext and activates only the authenticated workspace", async () => {
    workspaceMock.mockResolvedValue({
      ok: true,
      context: { workspaceId: "workspace-2", userId: "user-2", role: "owner" }
    });
    let secretPayload: Record<string, unknown> | null = null;
    let integrationPayload: Record<string, unknown> | null = null;
    const integrationSelect = {
      select: vi.fn(),
      eq: vi.fn(),
      single: vi.fn().mockResolvedValue({
        data: { id: "integration-2", webhook_key: "00000000-0000-4000-8000-000000000202" },
        error: null
      }),
      update: vi.fn((payload: Record<string, unknown>) => {
        integrationPayload = payload;
        return { eq: vi.fn().mockResolvedValue({ error: null }) };
      })
    };
    integrationSelect.select.mockReturnValue(integrationSelect);
    integrationSelect.eq.mockReturnValue(integrationSelect);
    adminMock.mockReturnValue({
      from: vi.fn((table: string) => table === "whatsapp_integration_secrets"
        ? {
            upsert: vi.fn((payload: Record<string, unknown>) => {
              secretPayload = payload;
              return Promise.resolve({ error: null });
            })
          }
        : integrationSelect)
    } as never);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(encryptMock).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(secretPayload)).not.toContain(input.accessToken);
    expect(JSON.stringify(secretPayload)).not.toContain(input.appSecret);
    expect(JSON.stringify(secretPayload)).not.toContain(input.verifyToken);
    expect(integrationPayload).toMatchObject({
      status: "active",
      credentials_mode: "encrypted",
      phone_number_id: "phone-id-2"
    });
  });
});
