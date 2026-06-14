import { createRoute, z } from "@hono/zod-openapi";
import { AccountDashboardService } from "@/application/account/accountDashboardService";
import { SavedFacilityService } from "@/application/saved/savedFacilityService";
import { TourRequestService } from "@/application/tours/tourRequestService";
import type { Repositories } from "@/db/repositories/ports";
import type { AppOpenAPI } from "@/interface/app";
import {
  AccountDashboardSchema,
  CreateTourRequestSchema,
  FacilityIdRequestSchema,
  SavedFacilityCardSchema,
  SavedFacilitySchema,
  TourRequestSchema,
} from "@/interface/schemas/family.schema";
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

export function registerFamilyRoutes(app: AppOpenAPI) {
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/list_saved_facilities",
      operationId: "list_saved_facilities",
      tags: ["family"],
      request: { body: jsonBody(EmptyJsonBodySchema) },
      responses: ok(listEnvelopeSchema(SavedFacilityCardSchema, zPage(), "ListSavedFacilitiesResponse")),
    }),
    async (c) => c.json(listEnvelope(await services(c.get("repos")).saved.list(ctx(c)), emptyPage()), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/create_saved_facility",
      operationId: "create_saved_facility",
      tags: ["family"],
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
      path: "/api/v1/delete_saved_facility",
      operationId: "delete_saved_facility",
      tags: ["family"],
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
      path: "/api/v1/create_tour_request",
      operationId: "create_tour_request",
      tags: ["family"],
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
      path: "/api/v1/list_tour_requests",
      operationId: "list_tour_requests",
      tags: ["family"],
      request: { body: jsonBody(EmptyJsonBodySchema) },
      responses: ok(listEnvelopeSchema(TourRequestSchema, zPage(), "ListTourRequestsResponse")),
    }),
    async (c) => c.json(listEnvelope(await services(c.get("repos")).tours.list(ctx(c)), emptyPage()), 200),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/get_account_dashboard",
      operationId: "get_account_dashboard",
      tags: ["family"],
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
