export type ActorRole = "anonymous" | "family" | "facility_manager" | "admin" | "moderator" | "cms_editor";

export interface ActorContext {
  kind: "anonymous" | "user";
  userId: string | null;
  sessionId: string | null;
  roles: ActorRole[];
  facilityIds?: string[];
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
  roles: ["anonymous"],
};

export function requireFamilyActor(ctx: RequestContext): asserts ctx is RequestContext & {
  actor: ActorContext & { kind: "user"; userId: string };
} {
  if (ctx.actor.kind !== "user" || !ctx.actor.roles.includes("family")) {
    throw new (class extends Error {
      code = "unauthenticated";
    })("A signed-in family user is required.");
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
