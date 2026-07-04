import { createRoute, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { createAuthServices } from "@/application/auth/createAuthServices";
import type { AppBindings } from "@/config/env";
import type { AppOpenAPI } from "@/interface/app";
import { readJson } from "@/interface/http/requestValidation";
import {
  dataEnvelope,
  dataEnvelopeSchema,
  EmptyJsonBodySchema,
  ErrorEnvelopeSchema,
} from "@/shared/envelopes/envelope";
import { anonymousActor, type RequestContext } from "@/shared/request-context/context";

const UserLoginRequestSchema = z
  .object({
    email: z.email(),
    password: z.string().min(1),
  })
  .strict()
  .openapi("UserLoginRequest");

const UserSignUpRequestSchema = z
  .object({
    email: z.email(),
    password: z.string().min(8),
    display_name: z.string().min(1).optional(),
  })
  .strict()
  .openapi("UserSignUpRequest");

const UserEmailRequestSchema = z
  .object({ email: z.email() })
  .strict()
  .openapi("UserEmailRequest");

const UserPasswordResetConfirmRequestSchema = z
  .object({
    email: z.email(),
    token: z.string().min(1),
    password: z.string().min(8),
  })
  .strict()
  .openapi("UserPasswordResetConfirmRequest");

const UserEmailVerificationConfirmRequestSchema = z
  .object({
    email: z.email(),
    token: z.string().min(1),
  })
  .strict()
  .openapi("UserEmailVerificationConfirmRequest");

const SafeUserSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    display_name: z.string(),
  })
  .strict()
  .openapi("SafeUser");

const UserLoginResponseSchema = z
  .object({
    session: z.object({ id: z.string(), audience: z.literal("user"), expires_at: z.string() }).strict(),
    user: SafeUserSchema,
    roles: z.array(z.string()),
    csrf_token: z.string(),
  })
  .strict()
  .openapi("UserLoginResponseData");

const UserSignUpResponseSchema = z
  .object({
    user: SafeUserSchema.nullable(),
    email: z.string(),
    email_verification_required: z.boolean(),
  })
  .strict()
  .openapi("UserSignUpResponseData");

const UserEmailAckSchema = z.object({ email: z.string() }).strict().openapi("UserEmailAckData");

const UserLogoutResponseSchema = z.object({ id: z.string() }).strict().openapi("UserLogoutResponseData");

export function registerAuthRoutes(app: AppOpenAPI) {
  for (const route of [
    { path: "/api/v1/user/auth/login", operationId: "user_auth_login" },
    { path: "/api/v1/create_session", operationId: "create_session" },
  ]) {
    app.openAPIRegistry.registerPath({
      method: "post",
      ...route,
      tags: ["user"],
      request: { body: jsonBody(UserLoginRequestSchema) },
      responses: ok(dataEnvelopeSchema(UserLoginResponseSchema, `${route.operationId}Response`)),
      "x-goldenyears-invalidates": ["session", "account"],
    });
  }

  for (const route of [
    { path: "/api/v1/user/auth/logout", operationId: "user_auth_logout" },
    { path: "/api/v1/delete_session", operationId: "delete_session" },
  ]) {
    app.openAPIRegistry.registerPath({
      method: "post",
      ...route,
      tags: ["user"],
      request: { body: jsonBody(EmptyJsonBodySchema) },
      responses: ok(dataEnvelopeSchema(UserLogoutResponseSchema, `${route.operationId}Response`)),
      "x-goldenyears-invalidates": ["session", "account"],
    });
  }

  app.openAPIRegistry.registerPath({
    method: "post",
    path: "/api/v1/user/auth/signup",
    operationId: "user_auth_signup",
    tags: ["user"],
    request: { body: jsonBody(UserSignUpRequestSchema) },
    responses: ok(dataEnvelopeSchema(UserSignUpResponseSchema, "UserSignUpResponse")),
    "x-goldenyears-invalidates": ["session", "account"],
  });

  app.openAPIRegistry.registerPath({
    method: "post",
    path: "/api/v1/user/auth/confirm_verification",
    operationId: "user_auth_confirm_verification",
    tags: ["user"],
    request: { body: jsonBody(UserEmailVerificationConfirmRequestSchema) },
    responses: ok(dataEnvelopeSchema(UserEmailAckSchema, "UserEmailVerificationConfirmResponse")),
  });

  app.openAPIRegistry.registerPath({
    method: "post",
    path: "/api/v1/user/auth/request_password_reset",
    operationId: "user_auth_request_password_reset",
    tags: ["user"],
    request: { body: jsonBody(UserEmailRequestSchema) },
    responses: ok(dataEnvelopeSchema(UserEmailAckSchema, "UserPasswordResetRequestResponse")),
  });

  app.openAPIRegistry.registerPath({
    method: "post",
    path: "/api/v1/user/auth/confirm_password_reset",
    operationId: "user_auth_confirm_password_reset",
    tags: ["user"],
    request: { body: jsonBody(UserPasswordResetConfirmRequestSchema) },
    responses: ok(dataEnvelopeSchema(UserEmailAckSchema, "UserPasswordResetConfirmResponse")),
  });

  app.openAPIRegistry.registerPath({
    method: "post",
    path: "/api/v1/user/auth/resend_verification",
    operationId: "user_auth_resend_verification",
    tags: ["user"],
    request: { body: jsonBody(UserEmailRequestSchema) },
    responses: ok(dataEnvelopeSchema(UserEmailAckSchema, "UserResendVerificationResponse")),
  });

  const login = async (c: Context<AppBindings>) => {
    const parsed = await readJson(c, UserLoginRequestSchema);
    const auth = createAuthServices(c.env, c.get("repos"), c.get("supabaseAuth"));
    return c.json(dataEnvelope(await auth.sessions.createSession(parsed, c, "user")), 200);
  };
  app.post("/api/v1/user/auth/login", login);
  app.post("/api/v1/create_session", login);

  const logout = async (c: Context<AppBindings>) => {
    const auth = createAuthServices(c.env, c.get("repos"), c.get("supabaseAuth"));
    return c.json(dataEnvelope(await auth.sessions.deleteSession(requestContext(c), c, "user")), 200);
  };
  app.post("/api/v1/user/auth/logout", logout);
  app.post("/api/v1/delete_session", logout);

  app.post("/api/v1/user/auth/signup", async (c) => {
    const parsed = await readJson(c, UserSignUpRequestSchema);
    const auth = createAuthServices(c.env, c.get("repos"), c.get("supabaseAuth"));
    return c.json(dataEnvelope(await auth.accounts.signUp(parsed)), 200);
  });

  app.post("/api/v1/user/auth/request_password_reset", async (c) => {
    const parsed = await readJson(c, UserEmailRequestSchema);
    const auth = createAuthServices(c.env, c.get("repos"), c.get("supabaseAuth"));
    return c.json(dataEnvelope(await auth.accounts.requestPasswordReset(parsed.email)), 200);
  });

  app.post("/api/v1/user/auth/confirm_verification", async (c) => {
    const parsed = await readJson(c, UserEmailVerificationConfirmRequestSchema);
    const auth = createAuthServices(c.env, c.get("repos"), c.get("supabaseAuth"));
    return c.json(dataEnvelope(await auth.accounts.confirmEmailVerification(parsed.email, parsed.token)), 200);
  });

  app.post("/api/v1/user/auth/confirm_password_reset", async (c) => {
    const parsed = await readJson(c, UserPasswordResetConfirmRequestSchema);
    const auth = createAuthServices(c.env, c.get("repos"), c.get("supabaseAuth"));
    return c.json(dataEnvelope(await auth.accounts.confirmPasswordReset(parsed)), 200);
  });

  app.post("/api/v1/user/auth/resend_verification", async (c) => {
    const parsed = await readJson(c, UserEmailRequestSchema);
    const auth = createAuthServices(c.env, c.get("repos"), c.get("supabaseAuth"));
    return c.json(dataEnvelope(await auth.accounts.resendVerificationEmail(parsed.email)), 200);
  });
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
