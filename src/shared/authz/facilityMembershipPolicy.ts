import type { RequestContext } from "@/shared/request-context/context";
import { requireManagedFacility, type FacilityMembershipLookup } from "./policies";

export interface FacilityMembership {
  user_id: string;
  facility_id: string;
  role: "manager" | "owner" | "staff";
  status: "active" | "disabled";
}

export class StaticFacilityMembershipPolicy implements FacilityMembershipLookup {
  constructor(private readonly memberships: FacilityMembership[]) {}

  canManageFacility(userId: string, facilityId: string): boolean {
    return this.memberships.some(
      (membership) =>
        membership.user_id === userId &&
        membership.facility_id === facilityId &&
        membership.status === "active" &&
        (membership.role === "manager" || membership.role === "owner"),
    );
  }
}

export function assertCanManageFacility(
  ctx: RequestContext,
  facilityId: string,
  memberships: FacilityMembershipLookup,
) {
  return requireManagedFacility(ctx, facilityId, memberships);
}
