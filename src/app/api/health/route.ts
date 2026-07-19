import { NextResponse } from "next/server";

import { getEnvValidation } from "@/lib/env";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "abhishree-sellers",
    timestamp: new Date().toISOString(),
    environment: getEnvValidation()
  });
}
