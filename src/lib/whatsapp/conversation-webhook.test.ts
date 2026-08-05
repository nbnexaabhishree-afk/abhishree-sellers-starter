import { describe, expect, it } from "vitest";

import {
  isSellerConversationStart,
  snapshotFromConversationRow,
  toConversationInput,
  toPropertyMediaInsert,
  toSellerLeadInsert
} from "./conversation-webhook";

describe("conversation webhook adapters", () => {
  it("recognizes seller intent without matching unrelated text", () => {
    expect(isSellerConversationStart("I want to sell my flat")).toBe(true);
    expect(isSellerConversationStart("Tell me about buying")).toBe(false);
  });

  it("normalizes WhatsApp media into engine input", () => {
    expect(toConversationInput({
      type: "image",
      image: { id: "image-1", mime_type: "image/jpeg", caption: "Front" }
    }, null)).toEqual({
      kind: "media",
      mediaId: "image-1",
      mediaType: "image",
      mimeType: "image/jpeg",
      caption: "Front"
    });
  });

  it("rejects malformed persisted state", () => {
    expect(snapshotFromConversationRow({ current_step: "unknown", collected_data: {} })).toBeNull();
    expect(snapshotFromConversationRow({ current_step: "seller_email", collected_data: { seller_name: "Asha" } }))
      .toMatchObject({ currentStep: "seller_email", status: "active" });
  });

  it("maps completed data to migration 005 seller lead columns", () => {
    expect(toSellerLeadInsert({
      seller_name: "Asha",
      seller_email: "asha@example.com",
      area_sqft: 1200,
      documents_available: true
    }, {
      contactId: "contact-1",
      whatsappContactId: "wa-contact-1",
      conversationStateId: "conversation-1"
    })).toMatchObject({
      seller_name: "Asha",
      seller_email: "asha@example.com",
      area_sqft: 1200,
      documents_available: true,
      flow_type: "seller",
      status: "completed"
    });
  });

  it("prepares seller media for the forward compatibility migration", () => {
    expect(toPropertyMediaInsert({
      property_media: {
        kind: "media",
        mediaId: "media-1",
        mediaType: "image",
        mimeType: "image/jpeg",
        filename: "front.jpg",
        caption: "Front view"
      }
    }, {
      sellerLeadId: "seller-lead-1",
      conversationStateId: "conversation-1",
      whatsappMessageId: "wamid.media-1"
    })).toEqual({
      enquiry_id: null,
      seller_lead_id: "seller-lead-1",
      conversation_state_id: "conversation-1",
      whatsapp_message_id: "wamid.media-1",
      media_id: "media-1",
      media_type: "image",
      storage_path: null,
      original_filename: "front.jpg",
      mime_type: "image/jpeg",
      caption: "Front view"
    });
  });
});
