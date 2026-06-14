import type { IdempotencyRecord, InMemoryStore } from "./inMemoryStore";

export class IdempotencyRepository {
  constructor(private readonly store: InMemoryStore) {}

  find(key: string, userId: string | null, now = new Date()) {
    return this.store.idempotencyKeys.find(
      (record) => record.key === key && record.user_id === userId && new Date(record.expires_at) > now,
    );
  }

  create(record: IdempotencyRecord) {
    this.store.idempotencyKeys.push(record);
    return record;
  }
}
