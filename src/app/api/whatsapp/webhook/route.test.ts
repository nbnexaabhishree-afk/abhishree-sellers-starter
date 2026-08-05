import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { GET, handleWhatsAppWebhook, POST } from "./route";

vi.mock("@/lib/env", () => ({
  getWhatsAppEnvValidation: () => ({ ok: true, missing: [] }),
  getWhatsAppEnv: () => ({
    WHATSAPP_VERIFY_TOKEN: "sample-token",
    WHATSAPP_ACCESS_TOKEN: "access-token",
    WHATSAPP_PHONE_NUMBER_ID: "phone-id",
    WHATSAPP_BUSINESS_ACCOUNT_ID: "business-id",
    WHATSAPP_APP_SECRET: "app-secret",
    WHATSAPP_API_VERSION: "v25.0"
  })
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
  if (table === "conversation_state" && operation === "select") {
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
    rpc(name: string, payload: Record<string, unknown>) {
      calls.push({ table: name, operation: "rpc", payload });
      const result = queuedResults[`rpc.${name}`]?.shift() ?? {
        data: { sellerLeadId: "seller-lead-1", propertyMediaId: "property-media-1" },
        error: null,
        status: 200
      };
      return Promise.resolve(result);
    },
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
      .toMatchObject({
        workspace_id: "00000000-0000-4000-8000-000000000001",
        whatsapp_message_id: "wamid.sample-message",
        direction: "inbound"
      });
  });

  it("scopes resolved tenant webhook data to that workspace", async () => {
    const database = createFakeDatabase();
    vi.mocked(createSupabaseAdminClient).mockReturnValue(database.client as never);

    const response = await handleWhatsAppWebhook(webhookRequest(realEnvelope), {
      workspaceId: "workspace-2",
      workspaceName: "Workspace Two",
      credentials: {
        verifyToken: "tenant-verify-token",
        accessToken: "tenant-access-token",
        phoneNumberId: "tenant-phone-id",
        appSecret: "tenant-app-secret",
        apiVersion: "v25.0"
      }
    });

    expect(response.status).toBe(200);
    expect(database.calls.find((call) =>
      call.table === "whatsapp_webhook_events" && call.operation === "insert"
    )?.payload).toMatchObject({ workspace_id: "workspace-2" });
    expect(database.calls.find((call) =>
      call.table === "messages" && call.operation === "upsert"
    )?.payload).toMatchObject({ workspace_id: "workspace-2" });
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

  it("starts the seller flow and persists migration-005-compatible state", async () => {
    const database = createFakeDatabase();
    vi.mocked(createSupabaseAdminClient).mockReturnValue(database.client as never);
    const payload = structuredClone(realEnvelope);
    payload.entry[0].changes[0].value.messages[0].text.body = "I want to sell";

    const response = await POST(webhookRequest(payload));

    expect(response.status).toBe(200);
    expect(database.calls.find((call) =>
      call.table === "conversation_state" && call.operation === "insert"
    )?.payload).toMatchObject({
      workspace_id: "00000000-0000-4000-8000-000000000001",
      flow_type: "seller",
      current_step: "seller_name",
      collected_data: {},
      status: "active"
    });
  });

  it("advances an existing seller conversation without shared process state", async () => {
    const database = createFakeDatabase({
      "conversation_state.select": [{
        data: {
          id: "conversation-1",
          current_step: "seller_name",
          collected_data: {},
          status: "active"
        },
        error: null,
        status: 200
      }]
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(database.client as never);
    const payload = structuredClone(realEnvelope);
    payload.entry[0].changes[0].value.messages[0].text.body = "Anita Shah";

    const response = await POST(webhookRequest(payload));

    expect(response.status).toBe(200);
    expect(database.calls.find((call) =>
      call.table === "conversation_state" && call.operation === "update"
    )?.payload).toMatchObject({
      current_step: "seller_email",
      collected_data: { seller_name: "Anita Shah" },
      status: "active"
    });
  });

  it("completes a seller conversation from a WhatsApp media message", async () => {
    const collectedData = {
      seller_name: "Anita Shah",
      seller_email: "anita@example.com",
      property_type: "Apartment",
      bhk: "3 BHK",
      area_sqft: 1450,
      location: "Ahmedabad",
      expected_price: 12500000,
      documents_available: true
    };
    const database = createFakeDatabase({
      "conversation_state.select": [{
        data: {
          id: "conversation-1",
          current_step: "property_media",
          collected_data: collectedData,
          status: "active"
        },
        error: null,
        status: 200
      }]
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(database.client as never);
    const mediaEnvelope = {
      object: "whatsapp_business_account",
      entry: [{
        id: "business-id",
        changes: [{
          field: "messages",
          value: {
            ...messageValue,
            messages: [{
              from: "15551234567",
              id: "wamid.media-message",
              timestamp: "1700000001",
              image: { id: "media-1", mime_type: "image/jpeg", caption: "Front view" },
              type: "image"
            }]
          }
        }]
      }]
    };

    const response = await POST(webhookRequest(mediaEnvelope));

    expect(response.status).toBe(200);
    expect(database.calls.find((call) =>
      call.table === "complete_seller_conversation" && call.operation === "rpc"
    )?.payload).toMatchObject({
      target_workspace_id: "00000000-0000-4000-8000-000000000001",
      target_conversation_state_id: "conversation-1",
      target_whatsapp_message_id: "wamid.media-message",
      collected_data: {
        seller_name: "Anita Shah",
        seller_email: "anita@example.com",
        documents_available: true,
        property_media: { mediaId: "media-1", mediaType: "image" }
      }
    });
    expect(database.calls.some((call) => call.table === "seller_leads")).toBe(false);
    expect(database.calls.some((call) => call.table === "property_media")).toBe(false);
  });
});
