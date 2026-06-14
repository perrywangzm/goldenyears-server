import { createMiddleware } from "hono/factory";
import type { AppBindings } from "@/config/env";
import { errorEnvelope } from "@/shared/envelopes/envelope";

export const enforceJsonPost = createMiddleware<AppBindings>(async (c, next) => {
  if (!c.req.path.startsWith("/api/v1/")) {
    await next();
    return;
  }

  if (c.req.method !== "POST") {
    return c.json(
      errorEnvelope({
        code: "bad_request",
        message: "API endpoints require POST.",
        details: { request_id: c.get("requestId") },
      }),
      405,
    );
  }

  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return c.json(
      errorEnvelope({
        code: "bad_request",
        message: "API endpoints require application/json.",
        details: { request_id: c.get("requestId") },
      }),
      400,
    );
  }

  await next();
});
