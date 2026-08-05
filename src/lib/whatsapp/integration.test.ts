import { afterEach, describe, expect, it, vi } from "vitest";

import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
  resolveWorkspaceWhatsAppIntegration
} from "./integration";

const key = Buffer.alloc(32, 7).toString("base64");

describe("WhatsApp integration secret encryption", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("round-trips without storing plaintext", () => {
    const encrypted = encryptIntegrationSecret("super-secret-token", key);

    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain("super-secret-token");
    expect(decryptIntegrationSecret(encrypted, key)).toBe("super-secret-token");
  });

  it("rejects ciphertext tampering", () => {
    const encrypted = encryptIntegrationSecret("super-secret-token", key);
    const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith("A") ? "B" : "A"}`;

    expect(() => decryptIntegrationSecret(tampered, key)).toThrow();
  });

  it("rejects keys that are not exactly 32 bytes", () => {
    expect(() => encryptIntegrationSecret("secret", Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
  });

  it("resolves and decrypts only the requested workspace integration", async () => {
    vi.stubEnv("WHATSAPP_CREDENTIALS_ENCRYPTION_KEY", key);
    const rows: Record<string, unknown> = {
      whatsapp_integrations: {
        id: "integration-2",
        workspace_id: "workspace-2",
        status: "active",
        credentials_mode: "encrypted",
        api_version: "v25.0",
        phone_number_id: "phone-id-2",
        business_account_id: "business-id-2",
        webhook_key: "00000000-0000-4000-8000-000000000202"
      },
      whatsapp_integration_secrets: {
        access_token_ciphertext: encryptIntegrationSecret("access-token-2", key),
        app_secret_ciphertext: encryptIntegrationSecret("app-secret-2", key),
        verify_token_ciphertext: encryptIntegrationSecret("verify-token-2", key)
      },
      workspaces: { name: "Workspace Two" }
    };
    const client = {
      from: vi.fn((table: string) => {
        const chain = {
          select: vi.fn(),
          eq: vi.fn(),
          maybeSingle: vi.fn().mockResolvedValue({ data: rows[table], error: null })
        };
        chain.select.mockReturnValue(chain);
        chain.eq.mockReturnValue(chain);
        return chain;
      })
    };

    const resolved = await resolveWorkspaceWhatsAppIntegration(client as never, "workspace-2");

    expect(resolved).toMatchObject({
      workspaceId: "workspace-2",
      workspaceName: "Workspace Two",
      credentials: {
        accessToken: "access-token-2",
        appSecret: "app-secret-2",
        verifyToken: "verify-token-2",
        phoneNumberId: "phone-id-2"
      }
    });
    expect(client.from).toHaveBeenCalledWith("whatsapp_integration_secrets");
  });
});
