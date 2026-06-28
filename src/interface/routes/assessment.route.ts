import { createRoute, z } from "@hono/zod-openapi";
import {
  ASSESSMENT_SESSION_COOKIE,
  AssessmentService,
  readAssessmentSessionCookie,
  resolveAssessmentOwnerSessionId,
} from "@/application/assessment/assessmentService";
import type { Repositories } from "@/db/repositories/ports";
import type { AppOpenAPI } from "@/interface/app";
import { readJson } from "@/interface/http/requestValidation";
import {
  AssessmentResultSchema,
  AssessmentSchemaSchema,
  CreateAssessmentResultRequestSchema,
  DeleteLatestAssessmentResultDataSchema,
  DeleteLatestAssessmentResultRequestSchema,
  GetAssessmentSchemaRequestSchema,
  GetLatestAssessmentResultRequestSchema,
  ListAssessmentMatchesRequestSchema,
  ListAssessmentMatchesResponseSchema,
} from "@/interface/schemas/assessment.schema";
import {
  dataEnvelope,
  dataEnvelopeSchema,
  ErrorEnvelopeSchema,
} from "@/shared/envelopes/envelope";
import type { RequestContext } from "@/shared/request-context/context";

function ctx(c: Parameters<Parameters<AppOpenAPI["openapi"]>[1]>[0]): RequestContext {
  return { requestId: c.get("requestId"), actor: c.get("actor"), now: new Date() };
}

function services(repos: Repositories) {
  return new AssessmentService(repos);
}

export function registerAssessmentRoutes(app: AppOpenAPI) {
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/get_assessment_schema",
      operationId: "get_assessment_schema",
      tags: ["assessment"],
      request: { body: jsonBody(GetAssessmentSchemaRequestSchema) },
      responses: ok(dataEnvelopeSchema(AssessmentSchemaSchema, "GetAssessmentSchemaResponse")),
    }),
    async (c) => {
      await readJson(c, GetAssessmentSchemaRequestSchema);
      return c.json(dataEnvelope(services(c.get("repos")).getSchema()), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/create_assessment_result",
      operationId: "create_assessment_result",
      tags: ["assessment"],
      request: { body: jsonBody(CreateAssessmentResultRequestSchema) },
      responses: mutationOk(dataEnvelopeSchema(AssessmentResultSchema, "CreateAssessmentResultResponse")),
      "x-goldenyears-invalidates": ["assessment"],
    } as any),
    async (c) => {
      const body = await readJson(c, CreateAssessmentResultRequestSchema);
      const ownerSessionId = resolveAssessmentOwnerSessionId(readAssessmentSessionCookie(c.req.header("cookie")) ?? undefined);
      const result = await services(c.get("repos")).create(ctx(c), body, ownerSessionId);
      if (!ctx(c).actor.userId) {
        setAssessmentSessionCookie(c, ownerSessionId);
      }
      return c.json(dataEnvelope(result), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/get_latest_assessment_result",
      operationId: "get_latest_assessment_result",
      tags: ["assessment"],
      request: { body: jsonBody(GetLatestAssessmentResultRequestSchema) },
      responses: ok(dataEnvelopeSchema(AssessmentResultSchema.nullable(), "GetLatestAssessmentResultResponse")),
    }),
    async (c) => {
      await readJson(c, GetLatestAssessmentResultRequestSchema);
      const result = await services(c.get("repos")).getLatest(
        ctx(c),
        readAssessmentSessionCookie(c.req.header("cookie")),
      );
      return c.json(dataEnvelope(result), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/list_assessment_matches",
      operationId: "list_assessment_matches",
      tags: ["assessment"],
      request: { body: jsonBody(ListAssessmentMatchesRequestSchema) },
      responses: ok(dataEnvelopeSchema(ListAssessmentMatchesResponseSchema, "ListAssessmentMatchesResponse")),
    }),
    async (c) => {
      const body = await readJson(c, ListAssessmentMatchesRequestSchema);
      const result = await services(c.get("repos")).listMatches(
        ctx(c),
        body.id,
        readAssessmentSessionCookie(c.req.header("cookie")),
      );
      return c.json(dataEnvelope(result), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/delete_latest_assessment_result",
      operationId: "delete_latest_assessment_result",
      tags: ["assessment"],
      request: { body: jsonBody(DeleteLatestAssessmentResultRequestSchema) },
      responses: mutationOk(dataEnvelopeSchema(DeleteLatestAssessmentResultDataSchema, "DeleteLatestAssessmentResultResponse")),
      "x-goldenyears-invalidates": ["assessment"],
    } as any),
    async (c) => {
      await readJson(c, DeleteLatestAssessmentResultRequestSchema);
      const result = await services(c.get("repos")).deleteLatest(
        ctx(c),
        readAssessmentSessionCookie(c.req.header("cookie")),
      );
      return c.json(dataEnvelope(result), 200);
    },
  );
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
    404: errorResponse("Not found."),
    422: errorResponse("Validation failed."),
  };
}

function mutationOk(schema: z.ZodTypeAny) {
  return ok(schema);
}

function errorResponse(description: string) {
  return { description, content: { "application/json": { schema: ErrorEnvelopeSchema } } };
}

function setAssessmentSessionCookie(c: Parameters<Parameters<AppOpenAPI["openapi"]>[1]>[0], value: string) {
  c.header(
    "Set-Cookie",
    `${ASSESSMENT_SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`,
  );
}
