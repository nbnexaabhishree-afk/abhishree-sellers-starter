import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { POST as signIn } from "./sign-in/route";
import { POST as signOut } from "./sign-out/route";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn()
}));

const createClientMock = vi.mocked(createSupabaseServerClient);

function loginRequest(email = "admin@example.com", password = "password") {
  return new Request("http://localhost:3000/auth/sign-in", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, password })
  });
}

describe("authentication route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3001");
  });

  it("redirects a successful sign-in to the dashboard without custom token cookies", async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    createClientMock.mockResolvedValue({ auth: { signInWithPassword } } as never);

    const response = await signIn(loginRequest());

    expect(signInWithPassword).toHaveBeenCalledWith({ email: "admin@example.com", password: "password" });
    expect(response.headers.get("location")).toBe("http://localhost:3001/dashboard");
    expect(response.cookies.get("sb-access-token")).toBeUndefined();
    expect(response.cookies.get("sb-refresh-token")).toBeUndefined();
  });

  it("returns a safe login error for invalid credentials", async () => {
    createClientMock.mockResolvedValue({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { code: "invalid_credentials", message: "Invalid login credentials", status: 400 }
        })
      }
    } as never);

    const response = await signIn(loginRequest());

    expect(response.headers.get("location")).toBe("http://localhost:3001/login?error=invalid");
  });

  it("signs out through Supabase and redirects to login", async () => {
    const signOutMock = vi.fn().mockResolvedValue({ error: null });
    createClientMock.mockResolvedValue({ auth: { signOut: signOutMock } } as never);

    const response = await signOut(new Request("http://localhost:3000/auth/sign-out", { method: "POST" }));

    expect(signOutMock).toHaveBeenCalledOnce();
    expect(response.headers.get("location")).toBe("http://localhost:3001/login");
  });
});
