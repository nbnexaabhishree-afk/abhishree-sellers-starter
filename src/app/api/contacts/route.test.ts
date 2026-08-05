import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseServiceRoleClient } from "@/lib/repositories/contact-repository";
import { requireApiWorkspace } from "@/lib/workspaces/context";
import { POST } from "./route";

vi.mock("@/lib/repositories/contact-repository", () => ({
  createSupabaseServiceRoleClient: vi.fn()
}));
vi.mock("@/lib/workspaces/context", () => ({
  requireApiWorkspace: vi.fn()
}));

const workspaceMock = vi.mocked(requireApiWorkspace);
const serviceClientMock = vi.mocked(createSupabaseServiceRoleClient);

function contactRequest() {
  return new Request("http://localhost:3000/api/contacts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Asha", phone: "+91 98765 43210" })
  });
}

describe("workspace-scoped contact creation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not access the service-role client without workspace authorization", async () => {
    workspaceMock.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Authentication required" }, { status: 401 }) as never
    });

    const response = await POST(contactRequest());

    expect(response.status).toBe(401);
    expect(serviceClientMock).not.toHaveBeenCalled();
  });

  it("scopes duplicate lookup and insert to the authenticated workspace", async () => {
    workspaceMock.mockResolvedValue({
      ok: true,
      context: { workspaceId: "workspace-1", userId: "user-1", role: "owner" }
    });
    const filters: Array<[string, unknown]> = [];
    let inserted: Record<string, unknown> | null = null;
    const lookupChain = {
      select: vi.fn(),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push([column, value]);
        return lookupChain;
      }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
    };
    lookupChain.select.mockReturnValue(lookupChain);
    const insertChain = {
      select: vi.fn(),
      single: vi.fn().mockResolvedValue({ data: { id: "contact-1" }, error: null })
    };
    insertChain.select.mockReturnValue(insertChain);
    serviceClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: lookupChain.select,
        insert: vi.fn((payload: Record<string, unknown>) => {
          inserted = payload;
          return insertChain;
        })
      })
    } as never);

    const response = await POST(contactRequest());

    expect(response.status).toBe(200);
    expect(filters).toContainEqual(["workspace_id", "workspace-1"]);
    expect(inserted).toMatchObject({ workspace_id: "workspace-1", normalized_phone: "919876543210" });
  });
});
