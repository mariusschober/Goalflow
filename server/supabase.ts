import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "./config";

export const createAdminClient = (config: AppConfig): SupabaseClient | undefined => {
  if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) return undefined;
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
};
