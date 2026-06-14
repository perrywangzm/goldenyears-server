import type { Repositories } from "@/db/repositories/ports";
import { toFacilityCardProjection } from "@/db/projections/facilityPublicProjection";
import { rankHomepageFacilities } from "@/domain/recommendations/homepageRanking";
import type { RequestContext } from "@/shared/request-context/context";

export class HomepageService {
  constructor(private readonly repos: Repositories) {}

  async getHomepage(ctx: RequestContext, input: { exclude_saved?: boolean }) {
    const savedIds = await this.repos.savedFacilities.savedFacilityIdsForUser(ctx.actor.userId);
    const publicFacilities = (
      await this.repos.facilities.listPublic({
        sort: [{ field: "rating", dir: "desc" }],
        limit: 24,
        offset: 0,
      })
    ).rows;
    const savedFacilities = await this.repos.facilities.listPublicByIds(savedIds);
    const rankedFacilities = rankHomepageFacilities(publicFacilities, savedFacilities);
    const publishedReviews = await this.repos.reviews.allPublished();
    const recommendedCards = rankedFacilities
      .filter((facility) => !input.exclude_saved || !savedIds.has(facility.id))
      .slice(0, 6)
      .map((facility) => toFacilityCardProjection(facility, publishedReviews, savedIds));
    const featuredCards = publicFacilities
      .slice(0, 6)
      .map((facility) => toFacilityCardProjection(facility, publishedReviews, savedIds));
    return {
      recommendation_request_id: `rec_${crypto.randomUUID()}`,
      featured_facilities: featuredCards,
      recommended_facilities: recommendedCards,
      search_options: await this.repos.references.getSearchOptions(),
    };
  }
}
