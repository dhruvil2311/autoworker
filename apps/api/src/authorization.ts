import type { NextFunction, Request, Response } from "express";
import type { AuthContext } from "@ghost/shared-types";

/**
 * Server-side permission model. The frontend only uses this to decide which experiences to show;
 * every protected route enforces it here, so hiding a page is never the security boundary.
 */
export type Permission =
  | "tasks.view"        // see published tasks
  | "tasks.run"         // launch a published task
  | "runs.view"         // read every run in the organization
  | "runs.control"      // pause, resume, cancel, retry any run
  | "hitl.decide"       // approve or reject any paused run
  | "hitl.decide_own"   // approve or reject runs the user launched
  | "workflows.build"   // upload evidence, analyse, compile, test
  | "workflows.publish" // publish a version for business use
  | "ops.view"          // service health, incidents, diagnostics
  | "org.view"          // organization usage and configuration (read)
  | "org.manage"        // members, roles, policies, connections
  | "audit.read"        // audit events, evidence, history
  | "audit.export";     // export audit records

export type Experience = "business" | "studio" | "operations" | "admin" | "audit";
export type Role = AuthContext["role"];

const ALL: Permission[] = [
  "tasks.view", "tasks.run", "runs.view", "runs.control", "hitl.decide", "hitl.decide_own",
  "workflows.build", "workflows.publish", "ops.view", "org.view", "org.manage", "audit.read", "audit.export"
];

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  owner: ALL,
  admin: ALL,
  builder: ["tasks.view", "tasks.run", "runs.view", "workflows.build", "workflows.publish", "hitl.decide_own"],
  operator: ["tasks.view", "tasks.run", "runs.view", "runs.control", "hitl.decide", "ops.view"],
  auditor: ["runs.view", "audit.read", "audit.export"],
  member: ["tasks.view", "tasks.run", "hitl.decide_own"],
  viewer: ["tasks.view", "runs.view"],
  worker: []
};

/** The permission an experience needs before it is offered to a user. */
export const EXPERIENCE_REQUIREMENTS: Readonly<Record<Experience, Permission>> = {
  business: "tasks.view",
  studio: "workflows.build",
  operations: "ops.view",
  admin: "org.manage",
  audit: "audit.read"
};

export const ASSIGNABLE_ROLES: readonly Role[] = ["owner", "admin", "builder", "operator", "auditor", "member", "viewer"];

export function permissionsFor(role: Role | string | undefined): Permission[] {
  return [...(ROLE_PERMISSIONS[(role || "") as Role] || [])];
}

export function hasPermission(auth: AuthContext | undefined, permission: Permission): boolean {
  return Boolean(auth) && permissionsFor(auth!.role).includes(permission);
}

export function experiencesFor(role: Role | string | undefined): Experience[] {
  const perms = permissionsFor(role);
  return (Object.keys(EXPERIENCE_REQUIREMENTS) as Experience[]).filter(e => perms.includes(EXPERIENCE_REQUIREMENTS[e]));
}

/** Rejects the request with 403 unless the caller holds at least one of the permissions. */
export function requirePermission(...permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (permissions.some(p => hasPermission(req.auth, p))) {
      next();
      return;
    }
    res.status(403).json({
      error: {
        code: "FORBIDDEN",
        message: "Your role does not allow this action.",
        required: permissions,
        request_id: (req as any).id
      }
    });
  };
}

/** Whether the caller may see or act on a run: organization-wide permission, or the run is theirs. */
export function canAccessRun(auth: AuthContext, run: { createdBy?: string | undefined }, orgWide: Permission, own: Permission = "tasks.run"): boolean {
  return hasPermission(auth, orgWide) || (hasPermission(auth, own) && Boolean(run.createdBy) && run.createdBy === auth.userId);
}
