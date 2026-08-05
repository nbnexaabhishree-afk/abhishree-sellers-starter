import { describe, expect, it } from "vitest";

import { ConversationEngine } from "./conversation-engine";
import { CONVERSATION_STEP_IDS, PropertyMediaInput } from "./conversation-flow";

const media: PropertyMediaInput = {
  kind: "media",
  mediaId: "media-123",
  mediaType: "image",
  mimeType: "image/jpeg",
  filename: "front.jpg"
};

const validInputs = [
  "Anita Shah",
  "ANITA@example.com",
  "Apartment",
  "3 BHK",
  "1,450",
  "Prahlad Nagar, Ahmedabad",
  "₹12,500,000",
  "yes",
  media
] as const;

describe("ConversationEngine", () => {
  it("progresses through all nine seller acquisition fields and completes", () => {
    const engine = new ConversationEngine();

    expect(engine.getCurrentStep()?.id).toBe(CONVERSATION_STEP_IDS[0]);
    validInputs.forEach((input, index) => {
      const result = engine.processInput(input);
      expect(result.accepted).toBe(true);
      expect(result.completed).toBe(index === validInputs.length - 1);
      expect(result.nextStep?.id ?? null).toBe(CONVERSATION_STEP_IDS[index + 1] ?? null);
    });

    expect(engine.getState()).toEqual({
      currentStep: null,
      status: "completed",
      collectedData: {
        seller_name: "Anita Shah",
        seller_email: "anita@example.com",
        property_type: "Apartment",
        bhk: "3 BHK",
        area_sqft: 1450,
        location: "Prahlad Nagar, Ahmedabad",
        expected_price: 12500000,
        documents_available: true,
        property_media: media
      }
    });
  });

  it("keeps the same step and state when input is invalid", () => {
    const engine = new ConversationEngine();
    engine.processInput("Anita Shah");

    const before = engine.getState();
    const result = engine.processInput("not-an-email");

    expect(result).toMatchObject({
      accepted: false,
      completed: false,
      error: "Please enter a valid email address.",
      nextStep: { id: "seller_email" }
    });
    expect(engine.getState()).toEqual(before);
  });

  it("validates numeric, yes/no, and media inputs", () => {
    const engine = new ConversationEngine();
    for (const input of validInputs.slice(0, 4)) engine.processInput(input);
    expect(engine.processInput("0").accepted).toBe(false);
    expect(engine.processInput("1000").accepted).toBe(true);
    engine.processInput("Ahmedabad");
    expect(engine.processInput("many rupees").accepted).toBe(false);
    engine.processInput("5000000");
    expect(engine.processInput("maybe").accepted).toBe(false);
    engine.processInput("no");
    expect(engine.processInput("photo.jpg").accepted).toBe(false);
    expect(engine.processInput(media).completed).toBe(true);
    expect(engine.getState().collectedData.documents_available).toBe(false);
  });

  it("keeps conversations independent and returns defensive state copies", () => {
    const first = new ConversationEngine();
    const second = new ConversationEngine();

    first.processInput("First Seller");
    second.processInput("Second Seller");
    first.processInput("first@example.com");

    const firstState = first.getState();
    firstState.collectedData.seller_name = "Mutated outside";

    expect(first.getState().collectedData.seller_name).toBe("First Seller");
    expect(second.getState()).toMatchObject({
      currentStep: "seller_email",
      collectedData: { seller_name: "Second Seller" }
    });
  });

  it("rehydrates persisted migration-005-compatible state", () => {
    const engine = new ConversationEngine({
      currentStep: "property_type",
      status: "active",
      collectedData: {
        seller_name: "Anita Shah",
        seller_email: "anita@example.com"
      }
    });

    expect(engine.getCurrentStep()?.id).toBe("property_type");
    expect(engine.processInput("Villa").nextStep?.id).toBe("bhk");
  });
});
