import { createRoute, z } from "@hono/zod-openapi";
import { ArticleReadService } from "@/application/articles/articleReadService";
import { FacilityReadService } from "@/application/facilities/facilityReadService";
import { FacilitySearchService } from "@/application/facilities/facilitySearchService";
import { HomepageService } from "@/application/facilities/homepageService";
import { ReferenceService } from "@/application/reference/referenceService";
import type { Repositories } from "@/db/repositories/ports";
import type { AppOpenAPI } from "@/interface/app";
import {
  ArticleIdentifierRequestSchema,
  ArticleSchema,
  FacilityDetailSchema,
  FacilityIdentifierRequestSchema,
  FacilityCardSchema,
  HomepageRequestSchema,
  HomepageResponseSchema,
  ListArticlesRequestSchema,
  ListFacilityReviewsRequestSchema,
  ReviewSchema,
  SearchFacilitiesRequestSchema,
  SearchOptionsSchema,
} from "@/interface/schemas/marketplace.schema";
import {
  dataEnvelope,
  dataEnvelopeSchema,
  EmptyJsonBodySchema,
  ErrorEnvelopeSchema,
  listEnvelope,
  listEnvelopeSchema,
} from "@/shared/envelopes/envelope";
import { OffsetPageResponseSchema, resolveOffsetPage } from "@/shared/pagination/page.schema";
import type { RequestContext } from "@/shared/request-context/context";

function contextFromHono(c: Parameters<Parameters<AppOpenAPI["openapi"]>[1]>[0]): RequestContext {
  return {
    requestId: c.get("requestId"),
    actor: c.get("actor"),
    now: new Date(),
  };
}

function services(repos: Repositories) {
  return {
    articles: new ArticleReadService(repos),
    facilityRead: new FacilityReadService(repos),
    homepage: new HomepageService(repos),
    reference: new ReferenceService(repos),
    search: new FacilitySearchService(repos),
  };
}

export function registerMarketplaceRoutes(app: AppOpenAPI) {
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/get_homepage",
      operationId: "get_homepage",
      tags: ["marketplace"],
      request: { body: jsonBody(HomepageRequestSchema) },
      responses: ok(dataEnvelopeSchema(HomepageResponseSchema, "GetHomepageResponse")),
    }),
    async (c) => {
      const svc = services(c.get("repos"));
      return c.json(
        dataEnvelope(await svc.homepage.getHomepage(contextFromHono(c), await readJson(c, HomepageRequestSchema))),
        200,
      );
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/get_search_options",
      operationId: "get_search_options",
      tags: ["marketplace"],
      request: { body: jsonBody(EmptyJsonBodySchema) },
      responses: ok(dataEnvelopeSchema(SearchOptionsSchema, "GetSearchOptionsResponse")),
    }),
    async (c) => c.json(dataEnvelope(await services(c.get("repos")).reference.getSearchOptions()), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/search_facilities",
      operationId: "search_facilities",
      tags: ["marketplace"],
      request: { body: jsonBody(SearchFacilitiesRequestSchema) },
      responses: ok(listEnvelopeSchema(FacilityCardSchema, OffsetPageResponseSchema, "SearchFacilitiesResponse")),
    }),
    async (c) => {
      const svc = services(c.get("repos"));
      const result = await svc.search.search(contextFromHono(c), await readJson(c, SearchFacilitiesRequestSchema));
      return c.json(listEnvelope(result.data, result.page), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/get_facility",
      operationId: "get_facility",
      tags: ["marketplace"],
      request: { body: jsonBody(FacilityIdentifierRequestSchema) },
      responses: {
        ...ok(dataEnvelopeSchema(FacilityDetailSchema, "GetFacilityResponse")),
        404: errorResponse("Facility not found."),
      },
    }),
    async (c) => {
      const body = await readJson(c, FacilityIdentifierRequestSchema);
      const svc = services(c.get("repos"));
      return c.json(dataEnvelope(await svc.facilityRead.getFacility(contextFromHono(c), body.id)), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/list_facility_reviews",
      operationId: "list_facility_reviews",
      tags: ["marketplace"],
      request: { body: jsonBody(ListFacilityReviewsRequestSchema) },
      responses: ok(listEnvelopeSchema(ReviewSchema, OffsetPageResponseSchema, "ListFacilityReviewsResponse")),
    }),
    async (c) => {
      const body = await readJson(c, ListFacilityReviewsRequestSchema);
      const page = resolveOffsetPage(body.page);
      const result = await services(c.get("repos")).facilityRead.listReviews(body.id, page.limit, page.offset);
      return c.json(listEnvelope(result.data, result.page), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/list_articles",
      operationId: "list_articles",
      tags: ["articles"],
      request: { body: jsonBody(ListArticlesRequestSchema) },
      responses: ok(listEnvelopeSchema(ArticleSchema, OffsetPageResponseSchema, "ListArticlesResponse")),
    }),
    async (c) => {
      const body = await readJson(c, ListArticlesRequestSchema);
      const page = resolveOffsetPage(body.page);
      const result = await services(c.get("repos")).articles.list(page.limit, page.offset);
      return c.json(listEnvelope(result.data, result.page), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/get_article",
      operationId: "get_article",
      tags: ["articles"],
      request: { body: jsonBody(ArticleIdentifierRequestSchema) },
      responses: {
        ...ok(dataEnvelopeSchema(ArticleSchema, "GetArticleResponse")),
        404: errorResponse("Article not found."),
      },
    }),
    async (c) => {
      const body = await readJson(c, ArticleIdentifierRequestSchema);
      return c.json(dataEnvelope(await services(c.get("repos")).articles.get(body.id)), 200);
    },
  );
}

async function readJson<T extends z.ZodTypeAny>(
  c: Parameters<Parameters<AppOpenAPI["openapi"]>[1]>[0],
  schema: T,
): Promise<z.infer<T>> {
  const parsed = schema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw new Error("Request validation failed.");
  }
  return parsed.data;
}

function jsonBody(schema: z.ZodTypeAny) {
  return {
    required: true,
    content: {
      "application/json": { schema },
    },
  };
}

function ok(schema: z.ZodTypeAny) {
  return {
    200: {
      description: "Successful response.",
      content: { "application/json": { schema } },
    },
    400: errorResponse("Bad request."),
    422: errorResponse("Validation failed."),
  };
}

function errorResponse(description: string) {
  return {
    description,
    content: { "application/json": { schema: ErrorEnvelopeSchema } },
  };
}
