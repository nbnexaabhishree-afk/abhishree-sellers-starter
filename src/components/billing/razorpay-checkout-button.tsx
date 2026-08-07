"use client";

import { useState } from "react";

type RazorpayResult = {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
};

type RazorpayOptions = {
  key: string;
  subscription_id: string;
  name: string;
  description: string;
  prefill: { email: string };
  handler: (response: RazorpayResult) => void;
  modal: { ondismiss: () => void };
  theme: { color: string };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void; on: (event: string, handler: (error: unknown) => void) => void };
  }
}

let checkoutScript: Promise<void> | null = null;

function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  checkoutScript ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Razorpay Checkout could not be loaded"));
    document.head.appendChild(script);
  });
  return checkoutScript;
}

export function RazorpayCheckoutButton({ plan, planName, disabled }: { plan: "starter" | "pro"; planName: string; disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan })
      });
      const checkout = await response.json();
      if (!response.ok) throw new Error(checkout.error ?? "Subscription could not be created");
      await loadCheckout();
      if (!window.Razorpay) throw new Error("Razorpay Checkout is unavailable");

      const instance = new window.Razorpay({
        key: checkout.keyId,
        subscription_id: checkout.subscriptionId,
        name: "PropertyFlow",
        description: `${planName} monthly subscription`,
        prefill: { email: checkout.customerEmail },
        theme: { color: "#2563eb" },
        modal: { ondismiss: () => setBusy(false) },
        handler: async (payment) => {
          const verification = await fetch("/api/billing/verify", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payment)
          });
          if (!verification.ok) {
            const body = await verification.json().catch(() => ({}));
            setError(body.error ?? "Payment verification failed"); setBusy(false); return;
          }
          window.location.assign("/billing?checkout=success");
        }
      });
      instance.on("payment.failed", () => { setError("Payment authorisation failed"); setBusy(false); });
      instance.open();
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Checkout failed");
      setBusy(false);
    }
  }

  return <div><button type="button" disabled={disabled || busy} onClick={startCheckout}>{busy ? "Opening…" : `Choose ${planName}`}</button>{error ? <p className="error-message">{error}</p> : null}</div>;
}
