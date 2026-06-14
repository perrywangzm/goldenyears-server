import { z } from "@hono/zod-openapi";
import { FilterDslSchema, ListRequestSchema } from "@/shared/filters/filterDsl.schema";
import {
  OffsetPageRequestSchema,
  OffsetPageResponseSchema,
  SortSchema,
} from "@/shared/pagination/page.schema";

export const MapBoundsSchema = z
  .object({
    north: z.number().min(-90).max(90),
    south: z.number().min(-90).max(90),
    east: z.number().min(-180).max(180),
    west: z.number().min(-180).max(180),
  })
  .strict()
  .openapi("MapBounds");

export const RatingSummarySchema = z
  .object({
    average: z.number(),
    count: z.number().int(),
    verified_count: z.number().int(),
  })
  .strict()
  .openapi("RatingSummary");

export const FacilityCardSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    tagline: z.string(),
    care_types: z.array(z.string()),
    region_id: z.string(),
    district: z.string(),
    price: z.object({
      from: z.number(),
      unit: z.enum(["month", "day"]),
      display: z.string(),
    }),
    rating: RatingSummarySchema,
    image_url: z.string(),
    features: z.array(z.string()),
    languages: z.array(z.string()),
    availability: z.object({
      status: z.enum(["available", "limited", "waitlist", "unavailable", "full"]),
      beds_available: z.number().int().nullable(),
      freshness: z.enum(["fresh", "stale", "unknown"]),
      updated_at: z.string().nullable(),
    }),
    map_marker: z.object({ latitude: z.number(), longitude: z.number() }).strict().nullable(),
    is_saved: z.boolean(),
  })
  .strict()
  .openapi("FacilityCard");

export const FacilityDetailSchema = FacilityCardSchema.extend({
  address: z.string(),
  postal_code: z.string(),
  gallery_urls: z.array(z.string()),
  capacity: z.number().int().nullable(),
  year_opened: z.number().int().nullable(),
  licence: z.string().nullable(),
  about: z.string(),
  highlights: z.array(z.string()),
  right_for_you_if: z.array(z.string()),
}).openapi("FacilityDetail");

export const SearchOptionsSchema = z
  .object({
    care_types: z.array(z.object({ id: z.string(), name: z.string() }).strict()),
    regions: z.array(z.object({ id: z.string(), name: z.string() }).strict()),
    features: z.array(z.object({ id: z.string(), name: z.string() }).strict()),
    languages: z.array(z.object({ id: z.string(), name: z.string() }).strict()),
    price_range: z.object({
      min: z.number(),
      max: z.number(),
      currency: z.literal("SGD"),
    }),
  })
  .strict()
  .openapi("SearchOptions");

export const HomepageRequestSchema = z
  .object({ exclude_saved: z.boolean().optional() })
  .strict()
  .openapi("GetHomepageRequest");

export const HomepageResponseSchema = z
  .object({
    recommendation_request_id: z.string(),
    featured_facilities: z.array(FacilityCardSchema),
    recommended_facilities: z.array(FacilityCardSchema),
    search_options: SearchOptionsSchema,
  })
  .strict()
  .openapi("HomepageResponse");

export const SearchFacilitiesRequestSchema = ListRequestSchema.extend({
  filters: FilterDslSchema.optional(),
  sort: z.array(SortSchema).optional(),
  page: OffsetPageRequestSchema.optional(),
  map_bounds: MapBoundsSchema.optional(),
})
  .strict()
  .openapi("SearchFacilitiesRequest");

export const FacilityIdentifierRequestSchema = z
  .object({ id: z.string().min(1) })
  .strict()
  .openapi("FacilityIdentifierRequest");

export const ListFacilityReviewsRequestSchema = FacilityIdentifierRequestSchema.extend({
  page: OffsetPageRequestSchema.optional(),
})
  .strict()
  .openapi("ListFacilityReviewsRequest");

export const ReviewSchema = z
  .object({
    id: z.string(),
    facility_id: z.string(),
    author_name: z.string(),
    relationship: z.string(),
    rating: z.number(),
    title: z.string(),
    body: z.string(),
    review_date: z.string(),
    verified: z.boolean(),
  })
  .strict()
  .openapi("Review");

export const ListArticlesRequestSchema = z
  .object({ page: OffsetPageRequestSchema.optional() })
  .strict()
  .openapi("ListArticlesRequest");

export const ArticleIdentifierRequestSchema = z
  .object({ id: z.string().min(1) })
  .strict()
  .openapi("ArticleIdentifierRequest");

export const ArticleSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    excerpt: z.string(),
    body: z.string(),
    category: z.string(),
    published_at: z.string(),
  })
  .strict()
  .openapi("Article");

export const MarketplaceResponses = {
  homepage: HomepageResponseSchema,
  searchOptions: SearchOptionsSchema,
  facilityCard: FacilityCardSchema,
  facilityDetail: FacilityDetailSchema,
  review: ReviewSchema,
  article: ArticleSchema,
  page: OffsetPageResponseSchema,
};
