import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextFunction, Request, Response } from "express";
import type { AppConfig } from "./config";
import type { AuthenticatedRequest, AuthenticatedUser } from "./types";
import { createUserVerifierClient } from "./supabase";

export const bearerToken = (request: Request): string | undefined => {
  const header = request.header("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7).trim() : undefined;
};
const tokenClaims = (token: string): { aal: "aal1" | "aal2"; sessionId?: string } => {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as {
      aal?: string;
      session_id?: string;
    };
    const sessionId = typeof payload.session_id === "string"
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.session_id)
      ? payload.session_id
      : undefined;
    return { aal: payload.aal === "aal2" ? "aal2" : "aal1", sessionId };
  } catch { return { aal: "aal1" }; }
};

export const createAuthMiddleware = (
  config: AppConfig,
  admin?: SupabaseClient,
  supabase: SupabaseClient | undefined = createUserVerifierClient(config)
) => {
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
    const claims = tokenClaims(token);
    if (!claims.sessionId) {
      response.status(401).json({ error: { code: "unauthorized", message: "The session is invalid or expired." } }); return;
    }
    const { data: activeSession, error: sessionError } = await admin.rpc("goalflow_session_is_active", {
      target_user_id: data.user.id,
      target_session_id: claims.sessionId
    });
    if (sessionError) {
      response.status(503).json({ error: { code: "session_check_unavailable", message: "Account access could not be verified." } }); return;
    }
    if (activeSession !== true) {
      response.status(401).json({ error: { code: "session_revoked", message: "This session has been signed out." } }); return;
    }
    const authEmail = data.user.email?.toLowerCase() ?? "";
    let { data: profile, error: profileError } = await admin.from("profiles").select("email,role,status")
      .eq("user_id", data.user.id).maybeSingle();
    if (!profile && !profileError && data.user.id === config.OWNER_USER_ID) {
      const bootstrap = await admin.rpc("bootstrap_goalflow_owner", {
        target_user_id: data.user.id,
        target_email: authEmail
      });
      if (bootstrap.error) profileError = bootstrap.error;
      else if (bootstrap.data === true) {
        const result = await admin.from("profiles").select("email,role,status")
          .eq("user_id", data.user.id).maybeSingle();
        profile = result.data; profileError = result.error;
      }
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
    if (profile.role === "owner" && config.OWNER_USER_ID && data.user.id !== config.OWNER_USER_ID) {
      response.status(403).json({ error: { code: "account_inactive", message: "This Goalflow account is not active." } }); return;
    }
    const user: AuthenticatedUser = {
      id: data.user.id,
      email: String(profile.email || authEmail),
      role: profile.role === "owner" ? "owner" : "beta",
      status: "active",
      aal: claims.aal
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
