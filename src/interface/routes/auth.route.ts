import { createRoute, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { SessionService } from "@/application/auth/sessionService";
import type { AppBindings } from "@/config/env";
import type { AppOpenAPI } from "@/interface/app";
import {
  dataEnvelope,
  dataEnvelopeSchema,
  EmptyJsonBodySchema,
  ErrorEnvelopeSchema,
} from "@/shared/envelopes/envelope";
import { anonymousActor, type RequestContext } from "@/shared/request-context/context";

const CreateSessionRequestSchema = z
  .object({
    email: z.email(),
    password: z.string().min(1),
  })
  .strict()
  .openapi("CreateSessionRequest");

const SafeUserSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    display_name: z.string(),
  })
  .strict()
  .openapi("SafeUser");

const CreateSessionResponseSchema = z
  .object({
    session: z.object({ id: z.string(), expires_at: z.string() }).strict(),
    user: SafeUserSchema,
    roles: z.array(z.string()),
    csrf_token: z.string(),
  })
  .strict()
  .openapi("CreateSessionResponseData");

const DeleteSessionResponseSchema = z.object({ id: z.string() }).strict().openapi("DeleteSessionResponseData");

export function registerAuthRoutes(app: AppOpenAPI) {
  app.openAPIRegistry.registerPath({
    method: "post",
    path: "/api/v1/create_session",
    operationId: "create_session",
    tags: ["auth"],
    request: { body: jsonBody(CreateSessionRequestSchema) },
    responses: ok(dataEnvelopeSchema(CreateSessionResponseSchema, "CreateSessionResponse")),
    "x-goldenyears-invalidates": ["session", "account"],
  });
  app.openAPIRegistry.registerPath({
    method: "post",
    path: "/api/v1/delete_session",
    operationId: "delete_session",
    tags: ["auth"],
    request: { body: jsonBody(EmptyJsonBodySchema) },
    responses: ok(dataEnvelopeSchema(DeleteSessionResponseSchema, "DeleteSessionResponse")),
    "x-goldenyears-invalidates": ["session", "account"],
  });

  app.post("/api/v1/create_session", async (c) => {
    const parsed = CreateSessionRequestSchema.parse(await c.req.json());
    return c.json(
      dataEnvelope(await new SessionService(c.get("repos")).createSession(parsed, c)),
      200,
    );
  });

  app.post("/api/v1/delete_session", async (c) =>
    c.json(dataEnvelope(await new SessionService(c.get("repos")).deleteSession(requestContext(c), c)), 200),
  );
}

function requestContext(c: Context<AppBindings>): RequestContext {
  return {
    requestId: c.get("requestId") ?? crypto.randomUUID(),
    actor: c.get("actor") ?? anonymousActor,
    now: new Date(),
  };
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
    422: errorResponse("Validation failed."),
  };
}

function errorResponse(description: string) {
  return { description, content: { "application/json": { schema: ErrorEnvelopeSchema } } };
}
