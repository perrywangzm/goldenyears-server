import { createMiddleware } from "hono/factory";
import type { AppBindings } from "@/config/env";
import { errorEnvelope } from "@/shared/envelopes/envelope";
import { normalizeError } from "@/shared/errors/apiError";
import { logger } from "@/shared/logging/logger";

export const errorEnvelopeMiddleware = createMiddleware<AppBindings>(async (c, next) => {
  try {
    await next();
  } catch (error) {
    const normalized = normalizeError(error);
    const requestId = c.get("requestId");
    if (normalized.code === "internal_error") {
      logger.error("api.internal_error", { request_id: requestId, error });
    }
    const details =
      normalized.details === undefined
        ? { request_id: requestId }
        : { ...normalized.details, request_id: requestId };
    return c.json(
      errorEnvelope({
        code: normalized.code,
        message: normalized.message,
        details,
      }),
      normalized.status as 500,
    );
  }
});
