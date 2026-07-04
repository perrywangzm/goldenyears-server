import type { Repositories } from "@/db/repositories/ports";
import { toFacilityCardProjection } from "@/db/projections/facilityPublicProjection";
import { AuditWriter } from "@/shared/audit/auditWriter";
import { requireAuthenticatedUser } from "@/shared/authz/policies";
import type { RequestContext } from "@/shared/request-context/context";

export class SavedFacilityService {
  private readonly audit: AuditWriter;

  constructor(private readonly repos: Repositories) {
    this.audit = new AuditWriter(repos.audit);
  }

  async list(ctx: RequestContext) {
    const userId = requireAuthenticatedUser(ctx);
    const savedIds = await this.repos.savedFacilities.savedFacilityIdsForUser(userId);
    const publishedReviews = await this.repos.reviews.allPublished();
    const saves = await this.repos.savedFacilities.listForUser(userId);
    const cards = await Promise.all(
      saves.map(async (save) => {
        const facility = await this.repos.facilities.findPublicById(save.facility_id);
        return toFacilityCardProjection(facility, publishedReviews, savedIds);
      }),
    );
    return cards;
  }

  async create(ctx: RequestContext, facilityId: string) {
    const userId = requireAuthenticatedUser(ctx);
    const facility = await this.repos.facilities.findPublicById(facilityId);
    const save = await this.repos.savedFacilities.create(userId, facility.id);
    await this.audit.write(ctx, {
      action: "create_saved_facility",
      resourceType: "saved_facility",
      resourceId: save.id,
      metadata: { facility_id: facility.id },
    });
    return {
      id: save.id,
      facility_id: facility.id,
      created_at: new Date(save.created_at).toISOString(),
    };
  }

  async delete(ctx: RequestContext, facilityId: string) {
    const userId = requireAuthenticatedUser(ctx);
    const facility = await this.repos.facilities.findPublicById(facilityId);
    await this.repos.savedFacilities.delete(userId, facility.id);
    await this.audit.write(ctx, {
      action: "delete_saved_facility",
      resourceType: "facility",
      resourceId: facility.id,
    });
    return { id: facility.id };
  }
}
