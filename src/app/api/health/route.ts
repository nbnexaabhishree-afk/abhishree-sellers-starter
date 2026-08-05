import { NextResponse } from "next/server";

import { getCoreEnvValidation, getStripeEnvValidation, getWhatsAppEnvValidation } from "@/lib/env";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "propertyflow",
    timestamp: new Date().toISOString(),
    environment: {
      core: getCoreEnvValidation(),
      whatsapp: getWhatsAppEnvValidation(),
      stripe: getStripeEnvValidation()
    }
  });
}
