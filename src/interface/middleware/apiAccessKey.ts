import { createMiddleware } from "hono/factory";
import type { AppBindings } from "@/config/env";
import { ApiError } from "@/shared/errors/apiError";
import { accessGateDisabled, hasValidStagingAccess } from "../../../../shared/edge-access/index";

export const apiAccessKeyMiddleware = createMiddleware<AppBindings>(async (c, next) => {
  const expected = c.env.API_ACCESS_KEY?.trim();
  if (accessGateDisabled(expected)) {
    await next();
    return;
  }

  if (c.req.method === "OPTIONS") {
    await next();
    return;
  }

  if (hasValidStagingAccess(c.req.raw, expected!)) {
    await next();
    return;
  }

  throw new ApiError("internal_error", "An unexpected error occurred.", 500);
});
