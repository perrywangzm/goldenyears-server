import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import type { AppBindings } from "@/config/env";
import { csrfCookieNames, expectedAudienceForPath } from "@/shared/authz/sessionAudience";
import { ApiError } from "@/shared/errors/apiError";

const mutationPrefixes = ["create_", "delete_", "update_", "replace_", "batch_"];

const csrfExemptEndpoints = new Set([
  "login",
  "create_session",
  "signup",
  "request_password_reset",
  "confirm_password_reset",
  "resend_verification",
]);

export const csrfMiddleware = createMiddleware<AppBindings>(async (c, next) => {
  const endpoint = c.req.path.split("/").at(-1) ?? "";
  if (csrfExemptEndpoints.has(endpoint)) {
    await next();
    return;
  }

  const isMutation = endpoint === "logout" || mutationPrefixes.some((prefix) => endpoint.startsWith(prefix));
  if (!isMutation) {
    await next();
    return;
  }

  const actor = c.get("actor");
  const headerToken = c.req.header("x-csrf-token");
  const cookieToken = getCookie(c, csrfCookieNames[expectedAudienceForPath(c.req.path)]);
  if (actor?.kind === "user" && (!headerToken || headerToken !== cookieToken)) {
    throw new ApiError("forbidden", "Mutation requires a CSRF signal.", 403);
  }

  await next();
});
