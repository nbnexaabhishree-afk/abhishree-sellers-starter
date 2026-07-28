import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { GET, POST } from "./route";

vi.mock("@/lib/env", () => ({
  getWhatsAppEnvValidation: () => ({ ok: true, missing: [] })
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn()
}));

type FakeResult = {
  data: unknown;
  error: { code?: string; message?: string } | null;
  status?: number;
  statusText?: string;
};

type DatabaseCall = {
  table: string;
  operation: string;
  payload?: Record<string, unknown>;
};

const messageValue = {
  messaging_product: "whatsapp",
  metadata: { display_phone_number: "15550000000", phone_number_id: "phone-id" },
  contacts: [{ profile: { name: "Sample Contact" }, wa_id: "15551234567" }],
  messages: [{
    from: "15551234567",
    id: "wamid.sample-message",
    timestamp: "1700000000",
    text: { body: "Hello" },
    type: "text"
  }]
};

const metaFieldSample = { field: "messages", value: messageValue };
const realEnvelope = {
  object: "whatsapp_business_account",
  entry: [{
    id: "business-id",
    changes: [{ field: "messages", value: messageValue }]
  }]
};

function defaultResult(table: string, operation: string): FakeResult {
  if (table === "contacts" && operation === "select") {
    return { data: null, error: null, status: 200 };
  }
  if (table === "whatsapp_webhook_events" && operation === "insert") {
    return { data: { id: "event-1", processing_status: "queued" }, error: null, status: 201 };
  }
  if (table === "whatsapp_webhook_events" && operation === "update") {
    return { data: { id: "event-1", processing_status: "processed" }, error: null, status: 200 };
  }
  return { data: { id: `${table}-1` }, error: null, status: 200 };
}

function createFakeDatabase(queuedResults: Record<string, FakeResult[]> = {}) {
  const calls: DatabaseCall[] = [];

  const client = {
    from(table: string) {
      let operation = "select";
      const chain: Record<string, unknown> & PromiseLike<FakeResult> = {
        insert(payload: Record<string, unknown>) {
          operation = "insert";
          calls.push({ table, operation, payload });
          return chain;
        },
        upsert(payload: Record<string, unknown>) {
          operation = "upsert";
          calls.push({ table, operation, payload });
          return chain;
        },
        update(payload: Record<string, unknown>) {
          operation = "update";
          calls.push({ table, operation, payload });
          return chain;
        },
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        single() {
          return chain;
        },
        maybeSingle() {
          return chain;
        },
        then<TResult1 = FakeResult, TResult2 = never>(
          onfulfilled?: ((value: FakeResult) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ) {
          const key = `${table}.${operation}`;
          const result = queuedResults[key]?.shift() ?? defaultResult(table, operation);
          return Promise.resolve(result).then(onfulfilled, onrejected);
        }
      };
      return chain;
    }
  };

  return { client, calls };
}

function webhookRequest(payload: unknown) {
  return new NextRequest("http://localhost:3001/api/whatsapp/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
}

function verificationRequest(searchParams: string) {
  return new NextRequest(`http://localhost:3001/api/whatsapp/webhook?${searchParams}`);
}

describe("WhatsApp webhook verification", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the challenge when the verify token matches", async () => {
    vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "  sample-token  ");

    const response = await GET(verificationRequest("hub.mode=subscribe&hub.verify_token=sample-token&hub.challenge=test-challenge"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toBe("test-challenge");
  });

  it("returns 403 when the verify token does not match", async () => {
    vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "sample-token");

    const response = await GET(verificationRequest("hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=test-challenge"));

    expect(response.status).toBe(403);
  });
});

describe("WhatsApp webhook persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("WHATSAPP_SIGNATURE_BYPASS", "true");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("persists a Meta dashboard messages field sample", async () => {
    const database = createFakeDatabase();
    vi.mocked(createSupabaseAdminClient).mockReturnValue(database.client as never);

    const response = await POST(webhookRequest(metaFieldSample));

    expect(response.status).toBe(200);
    expect(database.calls.some((call) => call.table === "whatsapp_webhook_events" && call.operation === "insert")).toBe(true);
    expect(database.calls.some((call) => call.table === "messages" && call.operation === "upsert")).toBe(true);
  });

  it("persists a real WhatsApp webhook envelope", async () => {
    const database = createFakeDatabase();
    vi.mocked(createSupabaseAdminClient).mockReturnValue(database.client as never);

    const response = await POST(webhookRequest(realEnvelope));

    expect(response.status).toBe(200);
    expect(database.calls.find((call) => call.table === "messages" && call.operation === "upsert")?.payload)
      .toMatchObject({ whatsapp_message_id: "wamid.sample-message", direction: "inbound" });
  });

  it("returns 500 when the raw event insert fails", async () => {
    const database = createFakeDatabase({
      "whatsapp_webhook_events.insert": [{
        data: null,
        error: { code: "PGRST204", message: "Required column is missing from the schema cache" },
        status: 400
      }]
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(database.client as never);

    const response = await POST(webhookRequest(realEnvelope));

    expect(response.status).toBe(500);
    expect(database.calls.some((call) => call.table === "messages")).toBe(false);
  });

  it("marks the raw event failed and returns 500 when message persistence fails", async () => {
    const database = createFakeDatabase({
      "messages.upsert": [{
        data: null,
        error: { code: "23502", message: "A required database value is null" },
        status: 400
      }]
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(database.client as never);

    const response = await POST(webhookRequest(realEnvelope));

    expect(response.status).toBe(500);
    expect(database.calls.find((call) =>
      call.table === "whatsapp_webhook_events"
      && call.operation === "update"
      && call.payload?.processing_status === "failed"
    )).toBeDefined();
  });

  it("returns 200 for a duplicate raw event without duplicating messages", async () => {
    const database = createFakeDatabase({
      "whatsapp_webhook_events.insert": [{
        data: null,
        error: { code: "23505", message: "duplicate key violates unique constraint" },
        status: 409
      }]
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(database.client as never);

    const response = await POST(webhookRequest(realEnvelope));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.duplicate).toBe(true);
    expect(database.calls.some((call) => call.table === "messages")).toBe(false);
  });

  it("stores the raw event before dependent records and marks it processed", async () => {
    const database = createFakeDatabase();
    vi.mocked(createSupabaseAdminClient).mockReturnValue(database.client as never);

    const response = await POST(webhookRequest(realEnvelope));

    expect(response.status).toBe(200);
    expect(database.calls[0]).toMatchObject({ table: "whatsapp_webhook_events", operation: "insert" });
    expect(database.calls.find((call) =>
      call.table === "whatsapp_webhook_events"
      && call.operation === "update"
      && call.payload?.processing_status === "processed"
    )).toBeDefined();
  });
});
