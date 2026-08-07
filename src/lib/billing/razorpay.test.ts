import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  normalizeRazorpayStatus,
  verifyRazorpayCheckoutSignature,
  verifyRazorpayWebhookSignature
} from "./razorpay";

describe("Razorpay billing security", () => {
  it("verifies subscription Checkout signatures in Razorpay's documented order", () => {
    const secret = "test-key-secret";
    const value = "pay_123|sub_456";
    const signature = createHmac("sha256", secret).update(value).digest("hex");
    expect(verifyRazorpayCheckoutSignature("pay_123", "sub_456", signature, secret)).toBe(true);
    expect(verifyRazorpayCheckoutSignature("pay_wrong", "sub_456", signature, secret)).toBe(false);
  });

  it("verifies raw webhook bodies without parsing or re-serialization", () => {
    const body = '{"event":"subscription.activated"}';
    const secret = "webhook-secret";
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyRazorpayWebhookSignature(body, signature, secret)).toBe(true);
    expect(verifyRazorpayWebhookSignature(`${body} `, signature, secret)).toBe(false);
  });

  it.each([
    ["created", "incomplete"], ["authenticated", "active"], ["active", "active"],
    ["pending", "past_due"], ["halted", "past_due"], ["cancelled", "canceled"],
    ["paused", "paused"], ["completed", "completed"], ["expired", "expired"]
  ])("normalizes %s to %s", (providerStatus, appStatus) => {
    expect(normalizeRazorpayStatus(providerStatus)).toBe(appStatus);
  });
});
