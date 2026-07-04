import { createRoute, z } from "@hono/zod-openapi";
import { getCookie } from "hono/cookie";
import type { Context } from "hono";
import { createAuthServices } from "@/application/auth/createAuthServices";
import { PartnerService } from "@/application/partner/partnerService";
import type { AppBindings } from "@/config/env";
import type { AppOpenAPI } from "@/interface/app";
import { readJson } from "@/interface/http/requestValidation";
import {
  dataEnvelope,
  dataEnvelopeSchema,
  EmptyJsonBodySchema,
  ErrorEnvelopeSchema,
  listEnvelopeSchema,
} from "@/shared/envelopes/envelope";
import { OffsetPageRequestSchema, OffsetPageResponseSchema, resolveOffsetPage } from "@/shared/pagination/page.schema";
import type { RequestContext } from "@/shared/request-context/context";

const PartnerLoginRequestSchema = z
  .object({ email: z.email(), password: z.string().min(1) })
  .strict()
  .openapi("PartnerLoginRequest");

const SafeUserSchema = z
  .object({ id: z.string(), email: z.string(), display_name: z.string() })
  .strict()
  .openapi("PartnerSafeUser");

const PartnerLoginResponseSchema = z
  .object({
    session: z
      .object({ id: z.string(), audience: z.literal("partner"), expires_at: z.string() })
      .strict(),
    user: SafeUserSchema,
    roles: z.array(z.string()),
    csrf_token: z.string(),
  })
  .strict()
  .openapi("PartnerLoginResponseData");

const PartnerMeSchema = z
  .object({
    user: SafeUserSchema,
    companies: z.array(
      z.object({ id: z.string(), name: z.string(), status: z.literal("active") }).strict(),
    ),
    managed_facility_count: z.number().int().nonnegative(),
    csrf: z
      .object({
        cookie_name: z.literal("gy_partner_session_csrf"),
        header_name: z.literal("X-CSRF-Token"),
        token: z.string().nullable(),
      })
      .strict(),
  })
  .strict()
  .openapi("PartnerMeData");

const ManagedFacilitySchema = z
  .object({
    id: z.string(),
    company_id: z.string(),
    slug: z.string(),
    name: z.string(),
    status: z.enum(["draft", "approved", "rejected", "disabled", "removed"]),
    is_enabled: z.boolean(),
    availability_status: z.enum(["available", "limited", "waitlist", "unavailable", "full"]),
    beds_available: z.number().int().nullable(),
    availability_updated_at: z.string().nullable(),
    version: z.number().int(),
    updated_at: z.string(),
  })
  .strict()
  .openapi("PartnerManagedFacility");

const ListManagedFacilitiesRequestSchema = z
  .object({ page: OffsetPageRequestSchema.optional() })
  .strict()
  .openapi("PartnerListManagedFacilitiesRequest");

export function registerPartnerRoutes(app: AppOpenAPI) {
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/partner/auth/login",
      operationId: "partner_auth_login",
      tags: ["partner"],
      request: { body: jsonBody(PartnerLoginRequestSchema) },
      responses: ok(dataEnvelopeSchema(PartnerLoginResponseSchema, "PartnerLoginResponse")),
      "x-goldenyears-invalidates": ["session", "partner_account"],
    } as any),
    async (c) =>
      c.json(
        dataEnvelope(
          await createAuthServices(c.env, c.get("repos"), c.get("supabaseAuth")).sessions.createSession(
            await readJson(c, PartnerLoginRequestSchema),
            c,
            "partner",
          ),
        ),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/partner/auth/logout",
      operationId: "partner_auth_logout",
      tags: ["partner"],
      request: { body: jsonBody(EmptyJsonBodySchema) },
      responses: ok(dataEnvelopeSchema(z.object({ id: z.string() }), "PartnerLogoutResponse")),
      "x-goldenyears-invalidates": ["session", "partner_account"],
    } as any),
    async (c) =>
      c.json(
        dataEnvelope(await createAuthServices(c.env, c.get("repos"), c.get("supabaseAuth")).sessions.deleteSession(context(c), c, "partner")),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/partner/get_me",
      operationId: "partner_get_me",
      tags: ["partner"],
      request: { body: jsonBody(EmptyJsonBodySchema) },
      responses: ok(dataEnvelopeSchema(PartnerMeSchema, "PartnerGetMeResponse")),
    }),
    async (c) =>
      c.json(
        dataEnvelope(
          await new PartnerService(c.get("repos")).getMe(
            context(c),
            getCookie(c, "gy_partner_session_csrf") ?? null,
          ),
        ),
        200,
      ),
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/partner/list_managed_facilities",
      operationId: "partner_list_managed_facilities",
      tags: ["partner"],
      request: { body: jsonBody(ListManagedFacilitiesRequestSchema) },
      responses: ok(
        listEnvelopeSchema(ManagedFacilitySchema, OffsetPageResponseSchema, "PartnerListManagedFacilitiesResponse"),
      ),
    }),
    async (c) => {
      const page = resolveOffsetPage((await readJson(c, ListManagedFacilitiesRequestSchema)).page);
      const result = await new PartnerService(c.get("repos")).listManagedFacilities(context(c), page);
      return c.json(result, 200);
    },
  );
}

function context(c: Context<AppBindings>): RequestContext {
  return { requestId: c.get("requestId"), actor: c.get("actor"), now: new Date() };
}

function jsonBody(schema: z.ZodTypeAny) {
  return { required: true, content: { "application/json": { schema } } };
}

function ok(schema: z.ZodTypeAny) {
  return {
    200: { description: "Successful response.", content: { "application/json": { schema } } },
    400: errorResponse("Bad request."),
    401: errorResponse("Unauthenticated."),
    403: errorResponse("Forbidden."),
    422: errorResponse("Validation failed."),
  };
}

function errorResponse(description: string) {
  return { description, content: { "application/json": { schema: ErrorEnvelopeSchema } } };
}
