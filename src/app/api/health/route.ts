import { NextResponse } from "next/server";

import { getCoreEnvValidation, getWhatsAppEnvValidation } from "@/lib/env";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "abhishree-sellers",
    timestamp: new Date().toISOString(),
    environment: {
      core: getCoreEnvValidation(),
      whatsapp: getWhatsAppEnvValidation()
    }
  });
}
