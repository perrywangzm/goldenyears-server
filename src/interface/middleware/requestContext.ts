import { createMiddleware } from "hono/factory";
import type { AppBindings } from "@/config/env";
import { sha256 } from "@/platform/crypto/passwordService";
import { expectedAudienceForPath, sessionCookieNames } from "@/shared/authz/sessionAudience";
import { anonymousActor } from "@/shared/request-context/context";

export const requestContextMiddleware = createMiddleware<AppBindings>(async (c, next) => {
  const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();
  c.set("requestId", requestId);
  c.header("X-Request-Id", requestId);
  const audience = expectedAudienceForPath(c.req.path);
  const token = readCookie(c.req.header("cookie"), sessionCookieNames[audience]);
  if (!token) {
    c.set("actor", anonymousActor);
    await next();
    return;
  }

  const repos = c.get("repos");
  const session = await repos.sessions.findActiveByTokenHash(await sha256(token), audience);
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
    audience: session.audience,
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
