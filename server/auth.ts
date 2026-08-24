import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NextFunction, Request, Response } from "express";
import type { AppConfig } from "./config";
import type { AuthenticatedRequest, AuthenticatedUser } from "./types";

export const bearerToken = (request: Request): string | undefined => {
  const header = request.header("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7).trim() : undefined;
};
const tokenAal = (token: string): "aal1" | "aal2" => {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { aal?: string };
    return payload.aal === "aal2" ? "aal2" : "aal1";
  } catch { return "aal1"; }
};

export const createAuthMiddleware = (config: AppConfig, admin?: SupabaseClient) => {
  const supabase = config.SUPABASE_URL && config.SUPABASE_ANON_KEY
    ? createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    : undefined;
  return async (request: Request, response: Response, next: NextFunction) => {
    const token = bearerToken(request);
    if (token === "local-demo" && config.NODE_ENV !== "production" && config.ENABLE_LOCAL_DEMO === "true") {
      (request as AuthenticatedRequest).user = { id: "local:owner", email: config.OWNER_EMAIL, role: "owner", status: "active", aal: "aal2" };
      next(); return;
    }
    if (!token || !supabase || !admin) {
      response.status(401).json({ error: { code: "unauthorized", message: "A valid session is required." } }); return;
    }
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      response.status(401).json({ error: { code: "unauthorized", message: "The session is invalid or expired." } }); return;
    }
    const authEmail = data.user.email?.toLowerCase() ?? "";
    let { data: profile, error: profileError } = await admin.from("profiles").select("email,role,status")
      .eq("user_id", data.user.id).maybeSingle();
    if (!profile && !profileError && authEmail === config.OWNER_EMAIL.toLowerCase()) {
      const result = await admin.from("profiles").upsert({ user_id: data.user.id, email: authEmail, role: "owner", status: "active" }, { onConflict: "user_id" })
        .select("email,role,status").single();
      profile = result.data; profileError = result.error;
    }
    if (profileError) {
      response.status(503).json({ error: { code: "profile_unavailable", message: "Account access could not be verified." } }); return;
    }
    if (profile && authEmail && profile.email !== authEmail) {
      const { data: updatedProfile, error: updateError } = await admin.from("profiles")
        .update({ email: authEmail, updated_at: new Date().toISOString() })
        .eq("user_id", data.user.id)
        .select("email,role,status")
        .single();
      if (updateError) {
        response.status(409).json({ error: { code: "recovery_email_conflict", message: "This recovery email is already connected to another account." } }); return;
      }
      profile = updatedProfile;
    }
    if (!profile || profile.status !== "active") {
      response.status(403).json({ error: { code: "account_inactive", message: "This Goalflow account is not active." } }); return;
    }
    const user: AuthenticatedUser = {
      id: data.user.id,
      email: String(profile.email || authEmail),
      role: profile.role === "owner" ? "owner" : "beta",
      status: "active",
      aal: tokenAal(token)
    };
    (request as AuthenticatedRequest).user = user;
    next();
  };
};

export const requireOwnerMfa = (request: Request, response: Response, next: NextFunction) => {
  if (request.user?.role === "owner" && request.user.aal !== "aal2") {
    response.status(403).json({ error: { code: "mfa_required", message: "Two-factor authentication is required." } }); return;
  }
  next();
};
