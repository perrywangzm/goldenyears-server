import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import type { AppBindings } from "@/config/env";
import { ApiError } from "@/shared/errors/apiError";

const mutationPrefixes = ["create_", "delete_", "update_", "replace_", "batch_"];

export const csrfMiddleware = createMiddleware<AppBindings>(async (c, next) => {
  const endpoint = c.req.path.split("/").at(-1) ?? "";
  if (!mutationPrefixes.some((prefix) => endpoint.startsWith(prefix))) {
    await next();
    return;
  }

  if (endpoint === "create_session") {
    await next();
    return;
  }

  const actor = c.get("actor");
  const headerToken = c.req.header("x-csrf-token");
  const cookieToken = getCookie(c, `${c.env?.SESSION_COOKIE_NAME ?? "gy_session"}_csrf`);
  if (actor?.kind === "user" && (!headerToken || headerToken !== cookieToken)) {
    throw new ApiError("forbidden", "Mutation requires a CSRF signal.", 403);
  }

  await next();
});
