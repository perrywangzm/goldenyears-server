import { createRoute, z } from "@hono/zod-openapi";
import { AccountDashboardService } from "@/application/account/accountDashboardService";
import { SavedFacilityService } from "@/application/saved/savedFacilityService";
import { TourRequestService } from "@/application/tours/tourRequestService";
import type { Repositories } from "@/db/repositories/ports";
import type { AppOpenAPI } from "@/interface/app";
import { readJson } from "@/interface/http/requestValidation";
import {
  AccountDashboardSchema,
  CreateTourRequestSchema,
  FacilityIdRequestSchema,
  SavedFacilityCardSchema,
  SavedFacilitySchema,
  TourRequestSchema,
} from "@/interface/schemas/user.schema";
import {
  dataEnvelope,
  dataEnvelopeSchema,
  EmptyJsonBodySchema,
  ErrorEnvelopeSchema,
  listEnvelope,
  listEnvelopeSchema,
} from "@/shared/envelopes/envelope";
import type { RequestContext } from "@/shared/request-context/context";

function ctx(c: Parameters<Parameters<AppOpenAPI["openapi"]>[1]>[0]): RequestContext {
  return { requestId: c.get("requestId"), actor: c.get("actor"), now: new Date() };
}

function services(repos: Repositories) {
  return {
    account: new AccountDashboardService(repos),
    saved: new SavedFacilityService(repos),
    tours: new TourRequestService(repos),
  };
}

export function registerUserRoutes(app: AppOpenAPI) {
  registerUserRouteSet(app, "/api/v1/user", "user_");
  registerUserRouteSet(app, "/api/v1", "");
}

function registerUserRouteSet(app: AppOpenAPI, basePath: string, operationPrefix: string) {
  app.openapi(
    createRoute({
      method: "post",
      path: `${basePath}/list_saved_facilities`,
      operationId: `${operationPrefix}list_saved_facilities`,
      tags: ["user"],
      request: { body: jsonBody(EmptyJsonBodySchema) },
      responses: ok(listEnvelopeSchema(SavedFacilityCardSchema, zPage(), "ListSavedFacilitiesResponse")),
    }),
    async (c) => c.json(listEnvelope(await services(c.get("repos")).saved.list(ctx(c)), emptyPage()), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: `${basePath}/create_saved_facility`,
      operationId: `${operationPrefix}create_saved_facility`,
      tags: ["user"],
      request: { body: jsonBody(FacilityIdRequestSchema) },
      responses: mutationOk(dataEnvelopeSchema(SavedFacilitySchema, "CreateSavedFacilityResponse")),
      "x-goldenyears-invalidates": ["saved_facility", "facility", "account"],
    } as any),
    async (c) => {
      const body = await readJson(c, FacilityIdRequestSchema);
      return c.json(dataEnvelope(await services(c.get("repos")).saved.create(ctx(c), body.facility_id)), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: `${basePath}/delete_saved_facility`,
      operationId: `${operationPrefix}delete_saved_facility`,
      tags: ["user"],
      request: { body: jsonBody(FacilityIdRequestSchema) },
      responses: mutationOk(dataEnvelopeSchema(zDeleteResponse(), "DeleteSavedFacilityResponse")),
      "x-goldenyears-invalidates": ["saved_facility", "facility", "account"],
    } as any),
    async (c) => {
      const body = await readJson(c, FacilityIdRequestSchema);
      return c.json(dataEnvelope(await services(c.get("repos")).saved.delete(ctx(c), body.facility_id)), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: `${basePath}/create_tour_request`,
      operationId: `${operationPrefix}create_tour_request`,
      tags: ["user"],
      request: {
        headers: IdempotencyHeaderSchema,
        body: jsonBody(CreateTourRequestSchema),
      },
      responses: mutationOk(dataEnvelopeSchema(TourRequestSchema, "CreateTourRequestResponse")),
      "x-goldenyears-invalidates": ["tour_request", "account"],
    } as any),
    async (c) =>
      c.json(
        dataEnvelope(
          await services(c.get("repos")).tours.create(
            ctx(c),
            await readJson(c, CreateTourRequestSchema),
            c.req.header("Idempotency-Key") ?? null,
          ),
        ),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: `${basePath}/list_tour_requests`,
      operationId: `${operationPrefix}list_tour_requests`,
      tags: ["user"],
      request: { body: jsonBody(EmptyJsonBodySchema) },
      responses: ok(listEnvelopeSchema(TourRequestSchema, zPage(), "ListTourRequestsResponse")),
    }),
    async (c) => c.json(listEnvelope(await services(c.get("repos")).tours.list(ctx(c)), emptyPage()), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: `${basePath}/get_account_dashboard`,
      operationId: `${operationPrefix}get_account_dashboard`,
      tags: ["user"],
      request: { body: jsonBody(EmptyJsonBodySchema) },
      responses: ok(dataEnvelopeSchema(AccountDashboardSchema, "GetAccountDashboardResponse")),
    }),
    async (c) => c.json(dataEnvelope(await services(c.get("repos")).account.getDashboard(ctx(c))), 200),
  );
}

const IdempotencyHeaderSchema = z
  .object({
    "Idempotency-Key": z.string().min(1).optional(),
  })
  .openapi("IdempotencyHeaders");

function zPage() {
  return z.object({
    type: z.literal("offset"),
    limit: z.number().int(),
    offset: z.number().int(),
    has_more: z.boolean(),
    total_count: z.number().int().optional(),
  });
}

function emptyPage() {
  return { type: "offset" as const, limit: 200, offset: 0, has_more: false };
}

function zDeleteResponse() {
  return z.object({ id: z.string() });
}

function jsonBody(schema: z.ZodTypeAny) {
  return { required: true, content: { "application/json": { schema } } };
}

function ok(schema: z.ZodTypeAny) {
  return {
    200: {
      description: "Successful response.",
      content: { "application/json": { schema } },
    },
    400: errorResponse("Bad request."),
    401: errorResponse("Unauthenticated."),
    403: errorResponse("Forbidden."),
    422: errorResponse("Validation failed."),
  };
}

function mutationOk(schema: z.ZodTypeAny) {
  return ok(schema);
}

function errorResponse(description: string) {
  return { description, content: { "application/json": { schema: ErrorEnvelopeSchema } } };
}
