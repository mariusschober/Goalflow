import type { Request } from "express";

export type UserRole = "owner" | "beta";
export type UserStatus = "active" | "suspended" | "deleted";
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  aal: "aal1" | "aal2";
}
export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
  requestId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      requestId?: string;
    }
  }
}
