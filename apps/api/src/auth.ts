import type { NextFunction, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import type { AuthContext } from "@ghost/shared-types";
import type { ApiConfig } from "./config.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

const DEV_USER_ID = "00000000-0000-0000-0000-000000000002";
const DEFAULT_TENANT_ID = "6ef50df4-58bb-48e3-9796-d25ba85d4dac";

function isDevAuthEnabled(config: ApiConfig) {
  return config.nodeEnv !== "production" && (config.devAuthEnabled || config.allowDevAuth);
}

function parseDevToken(token: string) {
  if (!token.startsWith("dev:")) return null;
  const [, rawUserId, rawTenantId, rawRole] = token.split(":");
  const userId = rawUserId && rawUserId !== "dev-user" ? rawUserId : DEV_USER_ID;
  const tenantId = rawTenantId ?? DEFAULT_TENANT_ID;
  const role = (rawRole as AuthContext["role"] | undefined) ?? "owner";
  return { userId, tenantId, role };
}

export function seedDevAuth(config: ApiConfig) {
  if (!isDevAuthEnabled(config)) return null;
  return {
    enabled: true,
    email: config.devAuthEmail,
    password: config.devAuthPassword,
    userId: config.devAuthUserId
  };
}

export function createAuthMiddleware(config: ApiConfig) {
  const supabase =
    config.supabaseUrl && config.supabaseAnonKey ? createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
  const serviceSupabase =
    config.supabaseUrl && config.supabaseServiceRoleKey
      ? createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false }
        })
      : null;

  return async function authMiddleware(req: Request, res: Response, next: NextFunction) {
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Missing bearer token", request_id: req.id } });
      return;
    }

    const token = header.slice("Bearer ".length);
    let userId: string;

    if (isDevAuthEnabled(config) && token.startsWith("dev:")) {
      const devContext = parseDevToken(token);
      if (devContext) {
        userId = devContext.userId;
        req.auth = { userId, tenantId: devContext.tenantId, role: devContext.role };
        next();
        return;
      } else {
        res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Invalid dev token", request_id: req.id } });
        return;
      }
    } else if (token.startsWith("dsk_")) {
      const tenantId = (req.header("x-tenant-id") as string) || DEFAULT_TENANT_ID;
      req.auth = {
        userId: `agent-${token.slice(4, 12)}`,
        tenantId,
        role: "worker"
      };
      next();
      return;
    } else {
      if (!supabase) {
        res.status(503).json({
          error: { code: "AUTH_NOT_CONFIGURED", message: "Supabase auth is not configured", request_id: req.id }
        });
        return;
      }
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user) {
        res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Invalid session", request_id: req.id } });
        return;
      }
      userId = data.user.id;
    }

    if (!serviceSupabase) {
      res.status(503).json({
        error: { code: "AUTHZ_NOT_CONFIGURED", message: "Supabase service client is not configured", request_id: req.id }
      });
      return;
    }

    const isBootstrap = req.path === '/api/v1/auth/bootstrap';

    const { data: membership, error: membershipError } = await serviceSupabase
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (membershipError) {
      if (isBootstrap) {
        req.auth = { userId, tenantId: "", role: "owner" };
        next();
        return;
      }
      res.status(500).json({ error: { code: "AUTHZ_FAILED", message: "Unable to resolve organization membership", request_id: req.id } });
      return;
    }

    if (!membership) {
      if (isBootstrap) {
        req.auth = { userId, tenantId: "", role: "owner" };
        next();
        return;
      }
      res.status(403).json({ error: { code: "TENANT_REQUIRED", message: "No organization membership found", request_id: req.id } });
      return;
    }

    req.auth = { userId, tenantId: membership.organization_id, role: membership.role as AuthContext["role"] };
    next();
  };
}