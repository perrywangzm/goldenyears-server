import type { PartnerFacilityRepositoryPort } from "@/db/repositories/ports";
import type { FacilityRow } from "@/db/schema/types";
import {
	authorizeCompanyFacility,
	requireSessionAudience,
} from "@/shared/authz/policies";
import { ApiError } from "@/shared/errors/apiError";
import type { RequestContext } from "@/shared/request-context/context";

export interface PartnerFacilityScope {
	actor_user_id: string;
	facility_id: string;
	company_id: string;
	facility: FacilityRow;
	checked_at: Date;
}

export async function requirePartnerFacilityScope(
	ctx: RequestContext,
	facilities: PartnerFacilityRepositoryPort,
	facilityId: string,
): Promise<PartnerFacilityScope> {
	const actorUserId = requireSessionAudience(ctx, "partner");
	const facility = await authorizeCompanyFacility(ctx, facilityId, facilities);
	if (!facility.company_id) {
		throw new ApiError("facility_not_found", "Facility was not found.", 404, {
			id: facilityId,
		});
	}

	return {
		actor_user_id: actorUserId,
		facility_id: facility.id,
		company_id: facility.company_id,
		facility,
		checked_at: ctx.now,
	};
}
