import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { POST } from "./route";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn()
}));

const createClientMock = vi.mocked(createSupabaseServerClient);

function request(body: unknown) {
  return new Request("http://localhost:3000/api/workspaces", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("workspace creation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires a signed-in user", async () => {
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) }
    } as never);

    expect((await POST(request({ name: "Acme Realty", slug: "acme-realty" }))).status).toBe(401);
  });

  it("creates the workspace through the atomic database function", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "workspace-1", error: null });
    createClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      rpc
    } as never);

    const response = await POST(request({ name: "Acme Realty", slug: "acme-realty" }));

    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("create_workspace", {
      workspace_name: "Acme Realty",
      workspace_slug: "acme-realty"
    });
    await expect(response.json()).resolves.toEqual({ id: "workspace-1" });
  });
});
