import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import type { AppBindings } from "@/config/env";
import { csrfMiddleware } from "@/interface/middleware/csrf";
import { databaseMiddleware } from "@/interface/middleware/database";
import { apiAccessKeyMiddleware } from "@/interface/middleware/apiAccessKey";
import { errorEnvelopeMiddleware } from "@/interface/middleware/errorEnvelope";
import { enforceJsonPost } from "@/interface/middleware/enforceJsonPost";
import { requestContextMiddleware } from "@/interface/middleware/requestContext";
import { securityHeaders } from "@/interface/middleware/securityHeaders";
import { openApiConfig } from "@/interface/openapi/registry";
import { registerAuthRoutes } from "@/interface/routes/auth.route";
import { registerHealthRoute } from "@/interface/routes/health.route";
import { registerFamilyRoutes } from "@/interface/routes/family.route";
import { registerMarketplaceRoutes } from "@/interface/routes/marketplace.route";
import { registerMeRoute } from "@/interface/routes/me.route";
import { errorEnvelope } from "@/shared/envelopes/envelope";
import { normalizeError } from "@/shared/errors/apiError";

export type AppOpenAPI = OpenAPIHono<AppBindings>;

function allowedOrigin(origin: string | undefined, configured: string | undefined) {
  if (!origin || !configured) {
    return null;
  }
  const origins = configured.split(",").map((item) => item.trim());
  return origins.includes(origin) ? origin : null;
}

export function createApiApp() {
  const app = new OpenAPIHono<AppBindings>();

  app.use("*", securityHeaders);
  app.use("*", errorEnvelopeMiddleware);
  app.use("*", apiAccessKeyMiddleware);
  app.use("*", databaseMiddleware);
  app.use(
    "*",
    cors({
      origin: (origin, c) => allowedOrigin(origin, c.env?.CORS_ORIGIN) ?? "http://localhost:3000",
      allowHeaders: ["Content-Type", "Idempotency-Key", "X-Request-Id", "X-Api-Access-Key"],
      allowMethods: ["POST", "OPTIONS"],
      credentials: true,
    }),
  );
  app.use("*", requestContextMiddleware);
  app.use("/api/v1/*", enforceJsonPost);
  app.use("/api/v1/*", csrfMiddleware);

  app.doc("/openapi.json", openApiConfig);
  app.get("/api/openapi.json", (c) => c.json(app.getOpenAPI31Document(openApiConfig)));

  registerHealthRoute(app);
  registerAuthRoutes(app);
  registerMeRoute(app);
  registerMarketplaceRoutes(app);
  registerFamilyRoutes(app);

  app.notFound((c) =>
    c.json(
      errorEnvelope({
        code: "bad_request",
        message: "Endpoint not found.",
        details: { request_id: c.get("requestId") },
      }),
      404,
    ),
  );

  app.onError((error, c) => {
    const normalized = normalizeError(error);
    return c.json(
      errorEnvelope({
        code: normalized.code,
        message: normalized.message,
        details: {
          ...normalized.details,
          request_id: c.get("requestId"),
        },
      }),
      normalized.status as 500,
    );
  });

  return app;
}

export default createApiApp();
