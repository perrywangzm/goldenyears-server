import { ApiError } from "@/shared/errors/apiError";
import type { ActorRole, RequestContext } from "@/shared/request-context/context";

export function requireFamilyUser(ctx: RequestContext): string {
  if (ctx.actor.kind !== "user" || !ctx.actor.userId || !ctx.actor.roles.includes("family")) {
    throw new ApiError("unauthenticated", "A signed-in family user is required.", 401);
  }
  return ctx.actor.userId;
}

export function requireAuthenticatedUser(ctx: RequestContext): string {
  if (ctx.actor.kind !== "user" || !ctx.actor.userId) {
    throw new ApiError("unauthenticated", "A signed-in user is required.", 401);
  }
  return ctx.actor.userId;
}

export function requireRole(ctx: RequestContext, role: Exclude<ActorRole, "anonymous">): string {
  const userId = requireAuthenticatedUser(ctx);
  if (!ctx.actor.roles.includes(role)) {
    throw new ApiError("forbidden", "This action is not allowed for the current actor.", 403);
  }
  return userId;
}

export interface FacilityMembershipLookup {
  canManageFacility(userId: string, facilityId: string): boolean;
}

export function requireManagedFacility(
  ctx: RequestContext,
  facilityId: string,
  memberships: FacilityMembershipLookup,
): string {
  const userId = requireRole(ctx, "facility_manager");
  if (!memberships.canManageFacility(userId, facilityId)) {
    throw new ApiError("forbidden", "This facility is not managed by the current actor.", 403);
  }
  return userId;
}
