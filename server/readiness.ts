import type { SupabaseClient } from "@supabase/supabase-js";
import { productionConfigurationProblems, supabasePublicKey, supabaseServerKey, type AppConfig } from "./config";

export type ReadinessProbe = () => Promise<boolean>;

export const checkSupabaseDependencies = async (
  config: AppConfig,
  admin: SupabaseClient | undefined
): Promise<void> => {
  if (!config.SUPABASE_URL || !supabasePublicKey(config) || !supabaseServerKey(config) || !admin) {
    throw new Error("Core cloud dependencies are not configured.");
  }

  const protocol = await admin.rpc("goalflow_sync_protocol_version")
    .abortSignal(AbortSignal.timeout(config.READINESS_TIMEOUT_MS));
  if (protocol.error || Number(protocol.data) !== 3) {
    throw new Error("The required synchronization protocol is unavailable.");
  }

  const accountProtocol = await admin.rpc("goalflow_account_protocol_version")
    .abortSignal(AbortSignal.timeout(config.READINESS_TIMEOUT_MS));
  if (accountProtocol.error || Number(accountProtocol.data) !== 1) {
    throw new Error("The required account protocol is unavailable.");
  }

  const profiles = await admin.from("profiles").select("user_id", { count: "exact", head: true })
    .abortSignal(AbortSignal.timeout(config.READINESS_TIMEOUT_MS));
  if (profiles.error) throw new Error("The account profile store is unavailable.");

  const authMetadata = await fetch(
    new URL("/auth/v1/.well-known/openid-configuration", config.SUPABASE_URL),
    {
      headers: { apikey: supabasePublicKey(config)! },
      signal: AbortSignal.timeout(config.READINESS_TIMEOUT_MS)
    }
  );
  if (!authMetadata.ok) throw new Error("The authentication service is unavailable.");
  const authDocument = await authMetadata.json() as { issuer?: string };
  if (authDocument.issuer !== `${config.SUPABASE_URL.replace(/\/$/, "")}/auth/v1`) {
    throw new Error("The authentication service identity is invalid.");
  }

  if (config.BACKUPS_ENABLED === "true") {
    const storage = await admin.storage.from("goalflow-backups").list("", { limit: 1 });
    if (storage.error) throw new Error("The encrypted backup store is unavailable.");
  }
};

export const createReadinessProbe = (
  config: AppConfig,
  dependencyCheck: () => Promise<void>
): ReadinessProbe => {
  let cachedUntil = 0;
  let cachedResult = false;
  let inFlight: Promise<boolean> | undefined;

  return async () => {
    const localOnly = config.NODE_ENV !== "production" && config.ENABLE_LOCAL_DEMO === "true";
    if (localOnly) return true;
    if (productionConfigurationProblems(config).length > 0) return false;
    if (!config.SUPABASE_URL || !supabasePublicKey(config) || !supabaseServerKey(config)) return false;
    if (Date.now() < cachedUntil) return cachedResult;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      try {
        await dependencyCheck();
        cachedResult = true;
      } catch {
        cachedResult = false;
      } finally {
        cachedUntil = Date.now() + config.READINESS_CACHE_MS;
        inFlight = undefined;
      }
      return cachedResult;
    })();
    return inFlight;
  };
};
