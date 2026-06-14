import type { Repositories } from "@/db/repositories/ports";
import { toFacilityDetailProjection } from "@/db/projections/facilityPublicProjection";
import type { RequestContext } from "@/shared/request-context/context";

export class FacilityReadService {
  constructor(private readonly repos: Repositories) {}

  async getFacility(ctx: RequestContext, id: string) {
    const facility = await this.repos.facilities.findPublicById(id);
    const publishedReviews = await this.repos.reviews.allPublished();
    const savedIds = await this.repos.savedFacilities.savedFacilityIdsForUser(ctx.actor.userId);
    return toFacilityDetailProjection(facility, publishedReviews, savedIds);
  }

  async listReviews(facilityId: string, limit: number, offset: number) {
    const facility = await this.repos.facilities.findPublicById(facilityId);
    const result = await this.repos.reviews.listPublishedForFacility(facility.id, limit, offset);
    return {
      data: result.rows.map((review) => ({
        id: review.id,
        facility_id: review.facility_id,
        author_name: review.author_name,
        relationship: review.relationship,
        rating: review.rating,
        title: review.title,
        body: review.body,
        review_date: review.review_date,
        verified: review.verified,
      })),
      page: { type: "offset" as const, limit, offset, has_more: result.hasMore, total_count: result.total },
    };
  }
}
