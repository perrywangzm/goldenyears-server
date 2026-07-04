import { ApiError } from "@/shared/errors/apiError";
import type { ActorRole, PlatformRole, RequestContext } from "@/shared/request-context/context";
import type { SessionAudience } from "@/shared/authz/sessionAudience";

export function requireAuthenticatedUser(ctx: RequestContext): string {
  if (ctx.actor.kind !== "user" || !ctx.actor.userId) {
    throw new ApiError("unauthenticated", "A signed-in user is required.", 401);
  }
  return ctx.actor.userId;
}

export function requireSessionAudience(ctx: RequestContext, audience: SessionAudience): string {
  const userId = requireAuthenticatedUser(ctx);
  if (ctx.actor.audience !== audience) {
    throw new ApiError("unauthenticated", `A ${audience} session is required.`, 401);
  }
  return userId;
}

export function requirePlatformRole(ctx: RequestContext, role: PlatformRole): string {
  const userId = requireAuthenticatedUser(ctx);
  if (!ctx.actor.roles.includes(role)) {
    throw new ApiError("forbidden", "This action is not allowed for the current actor.", 403);
  }
  return userId;
}

export function requireRole(ctx: RequestContext, role: Exclude<ActorRole, "anonymous">): string {
  return requirePlatformRole(ctx, role);
}

export interface ActiveCompanyUserLookup {
  findActiveMembership(userId: string, companyId: string): Promise<unknown | undefined>;
}

export async function requireActiveCompanyUser(
  ctx: RequestContext,
  companyId: string,
  memberships: ActiveCompanyUserLookup,
): Promise<string> {
  const userId = requireSessionAudience(ctx, "partner");
  if (!(await memberships.findActiveMembership(userId, companyId))) {
    throw new ApiError("forbidden", "The current partner cannot access this company.", 403);
  }
  return userId;
}

export interface AccessiblePartnerFacilityLookup<TFacility> {
  findAccessibleForUserAndFacility(userId: string, facilityId: string): Promise<TFacility | undefined>;
}

export async function authorizeCompanyFacility<TFacility>(
  ctx: RequestContext,
  facilityId: string,
  facilities: AccessiblePartnerFacilityLookup<TFacility>,
): Promise<TFacility> {
  const userId = requireSessionAudience(ctx, "partner");
  const facility = await facilities.findAccessibleForUserAndFacility(userId, facilityId);
  if (!facility) {
    throw new ApiError("facility_not_found", "Facility was not found.", 404, { id: facilityId });
  }
  return facility;
}
