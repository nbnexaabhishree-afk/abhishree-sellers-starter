import { describe, expect, it } from "vitest";

import { getRedirectOrigin } from "./redirect-origin";

describe("redirect origin", () => {
  it("never redirects local requests to port 3000", () => {
    expect(getRedirectOrigin("http://localhost:3000/auth/sign-in", {
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000"
    })).toBe("http://localhost:3001");
  });

  it("uses the configured origin outside local development", () => {
    expect(getRedirectOrigin("https://preview.example.com/login", {
      NEXT_PUBLIC_SITE_URL: "https://app.example.com"
    })).toBe("https://app.example.com");
  });

  it("falls back safely when the configured origin is invalid", () => {
    expect(getRedirectOrigin("https://app.example.com/login", {
      NEXT_PUBLIC_SITE_URL: "not a URL"
    })).toBe("https://app.example.com");
  });
});
