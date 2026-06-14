import type { AuditRepositoryPort } from "@/db/repositories/ports";
import type { RequestContext } from "@/shared/request-context/context";

export interface AuditWriteInput {
  action: string;
  resourceType: string;
  resourceId: string;
  before?: unknown;
  after?: unknown;
  diff?: unknown;
  source?: string;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export class AuditWriter {
  constructor(private readonly auditRepository: AuditRepositoryPort) {}

  async write(ctx: RequestContext, input: AuditWriteInput) {
    return this.auditRepository.write({
      id: `audit_${crypto.randomUUID()}`,
      actor_user_id: ctx.actor.userId,
      action: input.action,
      resource_type: input.resourceType,
      resource_id: input.resourceId,
      metadata: {
        ...(input.metadata ?? {}),
        before: input.before,
        after: input.after,
        diff: input.diff,
        source: input.source ?? ctx.source,
        notes: input.notes ?? null,
        request_id: ctx.requestId,
      },
      created_at: ctx.now,
    });
  }
}
