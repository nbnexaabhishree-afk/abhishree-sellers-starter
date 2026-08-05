import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiWorkspace, requireWorkspace } from "./context";

const { getCookieMock } = vi.hoisted(() => ({ getCookieMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn()
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: getCookieMock })
}));

const createClientMock = vi.mocked(createSupabaseServerClient);

function clientWith(user: { id: string } | null, memberships: unknown, membershipError: unknown = null) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn().mockResolvedValue({ data: memberships, error: membershipError })
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);

  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn().mockReturnValue(chain)
  };
}

const memberships = [
  {
    workspace_id: "00000000-0000-4000-8000-000000000001",
    role: "owner",
    workspaces: { name: "Abhishree", slug: "abhishree" }
  },
  {
    workspace_id: "00000000-0000-4000-8000-000000000002",
    role: "admin",
    workspaces: { name: "Second Realty", slug: "second-realty" }
  }
];

describe("workspace context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCookieMock.mockReturnValue(undefined);
  });

  it("rejects unauthenticated service-role API access", async () => {
    createClientMock.mockResolvedValue(clientWith(null, null) as never);
    const result = await requireApiWorkspace();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("rejects authenticated users without a workspace", async () => {
    createClientMock.mockResolvedValue(clientWith({ id: "user-1" }, []) as never);
    const result = await requireApiWorkspace();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("falls back to the user's first workspace membership", async () => {
    createClientMock.mockResolvedValue(clientWith({ id: "user-1" }, memberships) as never);
    await expect(requireApiWorkspace()).resolves.toEqual({
      ok: true,
      context: {
        workspaceId: "00000000-0000-4000-8000-000000000001",
        role: "owner",
        userId: "user-1"
      }
    });
  });

  it("selects a workspace only when the user is a member", async () => {
    getCookieMock.mockReturnValue({ value: "00000000-0000-4000-8000-000000000002" });
    createClientMock.mockResolvedValue(clientWith({ id: "user-1" }, memberships) as never);
    const result = await requireWorkspace();
    expect(result.workspaceName).toBe("Second Realty");
    expect(result.role).toBe("admin");
    expect(result.memberships).toHaveLength(2);
  });

  it("ignores a cookie for a workspace the user cannot access", async () => {
    getCookieMock.mockReturnValue({ value: "00000000-0000-4000-8000-000000000099" });
    createClientMock.mockResolvedValue(clientWith({ id: "user-1" }, memberships) as never);
    const result = await requireWorkspace();
    expect(result.workspaceName).toBe("Abhishree");
  });
});
