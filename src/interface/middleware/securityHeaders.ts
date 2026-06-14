import { createMiddleware } from "hono/factory";
import type { AppBindings } from "@/config/env";

export const securityHeaders = createMiddleware<AppBindings>(async (c, next) => {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  await next();
});
