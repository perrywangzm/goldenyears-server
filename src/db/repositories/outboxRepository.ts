import type { InMemoryStore, OutboxRecord } from "./inMemoryStore";

export class OutboxRepository {
  constructor(private readonly store: InMemoryStore) {}

  write(event: OutboxRecord) {
    this.store.outboxEvents.push(event);
    return event;
  }
}
