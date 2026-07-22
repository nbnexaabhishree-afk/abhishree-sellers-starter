import { getCoreEnv } from "@/lib/env";
import { createClient } from "@supabase/supabase-js";

export function createSupabaseAdminClient() {
  const env = getCoreEnv();

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
