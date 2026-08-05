import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireApiWorkspace } from "@/lib/workspaces/context";
import { resolveWorkspaceWhatsAppIntegration } from "@/lib/whatsapp/integration";
import { POST } from "./route";

vi.mock("@/lib/workspaces/context", () => ({
  requireApiWorkspace: vi.fn()
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({}))
}));
vi.mock("@/lib/whatsapp/integration", () => ({
  resolveWorkspaceWhatsAppIntegration: vi.fn()
}));

const workspaceMock = vi.mocked(requireApiWorkspace);
const integrationMock = vi.mocked(resolveWorkspaceWhatsAppIntegration);

function request() {
  return new NextRequest("http://localhost:3000/api/whatsapp/send-template", {
    method: "POST",
    body: JSON.stringify({
      to: "919876543210",
      templateName: "hello_world",
      languageCode: "en"
    })
  });
}

describe("workspace WhatsApp credential isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not use Abhishree environment credentials for another workspace", async () => {
    workspaceMock.mockResolvedValue({
      ok: true,
      context: { workspaceId: "another-workspace", userId: "user-1", role: "owner" }
    });
    integrationMock.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
