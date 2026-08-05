import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiWorkspace } from "./context";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn()
}));

const createClientMock = vi.mocked(createSupabaseServerClient);

function clientWith(user: { id: string } | null, membership: unknown, membershipError: unknown = null) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: membership, error: membershipError })
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);

  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn().mockReturnValue(chain)
  };
}

describe("workspace API context", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated service-role API access", async () => {
    createClientMock.mockResolvedValue(clientWith(null, null) as never);

    const result = await requireApiWorkspace();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("rejects authenticated users without a workspace", async () => {
    createClientMock.mockResolvedValue(clientWith({ id: "user-1" }, null) as never);

    const result = await requireApiWorkspace();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("returns the user's first workspace membership", async () => {
    createClientMock.mockResolvedValue(clientWith({ id: "user-1" }, {
      workspace_id: "workspace-1",
      role: "owner"
    }) as never);

    await expect(requireApiWorkspace()).resolves.toEqual({
      ok: true,
      context: { workspaceId: "workspace-1", role: "owner", userId: "user-1" }
    });
  });
});
