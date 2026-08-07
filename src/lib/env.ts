import { z } from "zod";

function normalizeEnvValue(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const requiredString = z.preprocess(normalizeEnvValue, z.string().trim().min(1));
const optionalString = z.preprocess(normalizeEnvValue, z.string().trim().min(1).optional());
const optionalStringWithDefault = (fallback: string) => z.preprocess(normalizeEnvValue, z.string().trim().min(1).default(fallback));

const supabaseProjectUrl = requiredString.refine((value) => {
  try {
    const url = new URL(value);
    return url.pathname === "/" || url.pathname === "";
  } catch {
    return false;
  }
}, "NEXT_PUBLIC_SUPABASE_URL must be the Supabase project origin without /rest/v1 or /auth/v1");

const authEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: supabaseProjectUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: requiredString
});

const coreEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: supabaseProjectUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: requiredString,
  SUPABASE_SERVICE_ROLE_KEY: requiredString
});

const whatsappEnvSchema = z.object({
  WHATSAPP_VERIFY_TOKEN: requiredString,
  WHATSAPP_ACCESS_TOKEN: requiredString,
  WHATSAPP_PHONE_NUMBER_ID: requiredString,
  WHATSAPP_BUSINESS_ACCOUNT_ID: optionalString,
  WHATSAPP_APP_SECRET: requiredString,
  WHATSAPP_API_VERSION: optionalStringWithDefault("v23.0")
});

const razorpayEnvSchema = z.object({
  RAZORPAY_KEY_ID: requiredString,
  RAZORPAY_KEY_SECRET: requiredString,
  RAZORPAY_WEBHOOK_SECRET: requiredString,
  RAZORPAY_STARTER_PLAN_ID: requiredString,
  RAZORPAY_PRO_PLAN_ID: requiredString
});

export function getCoreEnv(env: Record<string, string | undefined> = process.env) {
  return coreEnvSchema.parse(env);
}

export function getAuthEnv(env: Record<string, string | undefined> = process.env) {
  return authEnvSchema.parse(env);
}

export function getWhatsAppEnv(env: Record<string, string | undefined> = process.env) {
  return whatsappEnvSchema.parse(env);
}

export function getIntegrationEncryptionKey(env: Record<string, string | undefined> = process.env) {
  return requiredString.parse(env.WHATSAPP_CREDENTIALS_ENCRYPTION_KEY);
}

export function getRazorpayEnv(env: Record<string, string | undefined> = process.env) {
  return razorpayEnvSchema.parse(env);
}

export function getRazorpayEnvValidation(env: Record<string, string | undefined> = process.env) {
  const required = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "RAZORPAY_STARTER_PLAN_ID", "RAZORPAY_PRO_PLAN_ID"] as const;
  const missing = required.filter((name) => !env[name]?.trim());
  return { ok: missing.length === 0, missing };
}

export function getClientEnv(env: Record<string, string | undefined> = process.env) {
  return getAuthEnv(env);
}

export function getServerEnv(env: Record<string, string | undefined> = process.env) {
  return getCoreEnv(env);
}

export function getCoreEnvValidation(env: Record<string, string | undefined> = process.env) {
  const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  const missing = required.filter((name) => !env[name]?.trim());

  return {
    ok: missing.length === 0,
    missing
  };
}

export function getWhatsAppEnvValidation(env: Record<string, string | undefined> = process.env) {
  const required = ["WHATSAPP_VERIFY_TOKEN", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_API_VERSION"] as const;
  const missing = required.filter((name) => !env[name]?.trim());

  return {
    ok: missing.length === 0,
    missing
  };
}

export function getEnvValidation(env: Record<string, string | undefined> = process.env) {
  return getCoreEnvValidation(env);
}
