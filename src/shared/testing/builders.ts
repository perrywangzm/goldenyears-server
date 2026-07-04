import { buildRequestContext, type ActorContext, type RequestContext } from "@/shared/request-context/context";

export function buildUserActor(overrides: Partial<ActorContext> = {}): ActorContext {
  return {
    kind: "user",
    userId: "user_test",
    sessionId: "session_test",
    audience: "user",
    roles: [],
    ...overrides,
  };
}

export function buildTestRequestContext(overrides: Partial<RequestContext> = {}): RequestContext {
  return buildRequestContext({
    requestId: "req_test",
    now: new Date("2026-05-18T00:00:00.000Z"),
    actor: buildUserActor(),
    source: "test",
    ...overrides,
  });
}
