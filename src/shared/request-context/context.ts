import type { SessionAudience } from "@/shared/authz/sessionAudience";

export type PlatformRole = "admin" | "moderator" | "cms_editor";
export type ActorRole = "anonymous" | PlatformRole;

export interface ActorContext {
  kind: "anonymous" | "user";
  userId: string | null;
  sessionId: string | null;
  audience: SessionAudience | null;
  roles: ActorRole[];
}

export interface RequestContext {
  requestId: string;
  actor: ActorContext;
  now: Date;
  idempotencyKey?: string | null;
  source?: "public_api" | "admin_api" | "queue" | "cron" | "test";
  ipHash?: string | null;
  userAgent?: string | null;
}

export const anonymousActor: ActorContext = {
  kind: "anonymous",
  userId: null,
  sessionId: null,
  audience: null,
  roles: ["anonymous"],
};

export function requireAuthenticatedActor(ctx: RequestContext): asserts ctx is RequestContext & {
  actor: ActorContext & { kind: "user"; userId: string };
} {
  if (ctx.actor.kind !== "user" || !ctx.actor.userId) {
    throw new (class extends Error {
      code = "unauthenticated";
    })("A signed-in user is required.");
  }
}

export function buildRequestContext(input: Partial<RequestContext> = {}): RequestContext {
  const actor = input.actor ?? anonymousActor;
  return {
    requestId: input.requestId ?? `req_${crypto.randomUUID()}`,
    actor,
    now: input.now ?? new Date(),
    idempotencyKey: input.idempotencyKey ?? null,
    source: input.source ?? "public_api",
    ipHash: input.ipHash ?? null,
    userAgent: input.userAgent ?? null,
  };
}
