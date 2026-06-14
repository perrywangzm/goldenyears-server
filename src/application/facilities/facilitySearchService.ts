import type { Repositories } from "@/db/repositories/ports";
import { toFacilityCardProjection } from "@/db/projections/facilityPublicProjection";
import type { FilterNode } from "@/shared/filters/filterDsl.schema";
import type { MapBounds } from "@/domain/search/searchFilters";
import { resolveOffsetPage, type PageRequest } from "@/shared/pagination/page.schema";
import type { RequestContext } from "@/shared/request-context/context";

export class FacilitySearchService {
  constructor(private readonly repos: Repositories) {}

  async search(
    ctx: RequestContext,
    input: {
      filters?: FilterNode;
      sort?: Array<{ field: string; dir: "asc" | "desc" }>;
      map_bounds?: MapBounds;
      page?: PageRequest;
    },
  ) {
    const page = resolveOffsetPage(input.page);
    const result = await this.repos.facilities.listPublic({
      filters: input.filters,
      sort: input.sort,
      mapBounds: input.map_bounds,
      limit: page.limit,
      offset: page.offset,
    });
    const savedIds = await this.repos.savedFacilities.savedFacilityIdsForUser(ctx.actor.userId);
    const publishedReviews = await this.repos.reviews.allPublished();
    return {
      data: result.rows.map((facility) => toFacilityCardProjection(facility, publishedReviews, savedIds)),
      page: {
        type: "offset" as const,
        limit: page.limit,
        offset: page.offset,
        has_more: result.hasMore,
        total_count: result.total,
      },
    };
  }
}
