import { createMiddleware } from "hono/factory";
import type { AppBindings } from "@/config/env";
import { sha256 } from "@/platform/crypto/passwordService";
import { anonymousActor } from "@/shared/request-context/context";

export const requestContextMiddleware = createMiddleware<AppBindings>(async (c, next) => {
  const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();
  c.set("requestId", requestId);
  c.header("X-Request-Id", requestId);
  const token = readCookie(c.req.header("cookie"), c.env?.SESSION_COOKIE_NAME ?? "gy_session");
  if (!token) {
    c.set("actor", anonymousActor);
    await next();
    return;
  }

  const repos = c.get("repos");
  const session = await repos.sessions.findActiveByTokenHash(await sha256(token));
  const user = session ? await repos.users.findById(session.user_id) : undefined;
  if (!session || !user || user.status !== "active") {
    c.set("actor", anonymousActor);
    await next();
    return;
  }

  c.set("actor", {
    kind: "user",
    userId: user.id,
    sessionId: session.id,
    roles: await repos.users.rolesForUser(user.id),
  });
  await next();
});

function readCookie(header: string | undefined, name: string) {
  return header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
