import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { proxy } from "./proxy";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
vi.mock("@/lib/env", () => ({
  getAuthEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_test"
  })
}));

const createServerClientMock = vi.mocked(createServerClient);

function mockUser(user: { id: string } | null) {
  createServerClientMock.mockReturnValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) }
  } as never);
}

describe("authentication proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3001");
  });

  it("redirects an unauthenticated protected route to login", async () => {
    mockUser(null);

    const response = await proxy(new NextRequest("http://localhost:3000/dashboard"));

    expect(response.headers.get("location")).toBe("http://localhost:3001/login");
  });

  it("allows an authenticated user to access a protected route", async () => {
    mockUser({ id: "user-1" });

    const response = await proxy(new NextRequest("http://localhost:3001/settings/whatsapp-test"));

    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });

  it("redirects an authenticated login visit to the dashboard", async () => {
    mockUser({ id: "user-1" });

    const response = await proxy(new NextRequest("http://localhost:3000/login"));

    expect(response.headers.get("location")).toBe("http://localhost:3001/dashboard");
  });

  it("protects future route families", async () => {
    mockUser(null);

    for (const path of ["/campaigns/new", "/inbox", "/enquiries/123"]) {
      const response = await proxy(new NextRequest(`http://localhost:3001${path}`));
      expect(response.headers.get("location")).toBe("http://localhost:3001/login");
    }
  });
});
