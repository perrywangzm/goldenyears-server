import type { AuditRecord, InMemoryStore } from "./inMemoryStore";

export class AuditRepository {
  constructor(private readonly store: InMemoryStore) {}

  write(event: AuditRecord) {
    this.store.auditEvents.push(event);
    return event;
  }
}
