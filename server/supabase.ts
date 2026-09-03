import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabasePublicKey, supabaseServerKey, type AppConfig } from "./config";

const timeoutFetch = (timeoutMs: number): typeof fetch => {
  const boundedFetch: typeof fetch = async (input, init) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return fetch(input, { ...init, signal });
  };
  return boundedFetch;
};

const options = (config: AppConfig) => ({
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: timeoutFetch(config.UPSTREAM_TIMEOUT_MS) }
});

export const createAdminClient = (config: AppConfig): SupabaseClient | undefined => {
  const key = supabaseServerKey(config);
  if (!config.SUPABASE_URL || !key) return undefined;
  return createClient(config.SUPABASE_URL, key, options(config));
};

export const createUserVerifierClient = (config: AppConfig): SupabaseClient | undefined => {
  const key = supabasePublicKey(config);
  if (!config.SUPABASE_URL || !key) return undefined;
  return createClient(config.SUPABASE_URL, key, options(config));
};
