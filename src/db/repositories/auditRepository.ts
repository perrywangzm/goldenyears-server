import type { AuditRecord, InMemoryStore } from "./inMemoryStore";
import type { PartnerListAuditEventsInput } from "./ports";

export class AuditRepository {
  constructor(private readonly store: InMemoryStore) {}

  write(event: AuditRecord) {
    this.store.auditEvents.push(event);
    return event;
  }

  listForResource(input: PartnerListAuditEventsInput) {
    const matching = this.store.auditEvents
      .filter(
        (event) =>
          event.resource_type === input.resourceType &&
          event.resource_id === input.resourceId &&
          (!input.actions || input.actions.includes(event.action)),
      )
      .toSorted(
        (left, right) =>
          new Date(right.created_at).getTime() -
            new Date(left.created_at).getTime() || left.id.localeCompare(right.id),
      );
    const rows = matching.slice(input.offset, input.offset + input.limit);
    return {
      rows,
      total: matching.length,
      hasMore: input.offset + rows.length < matching.length,
    };
  }
}
