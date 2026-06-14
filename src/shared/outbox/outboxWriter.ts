import type { OutboxRepositoryPort } from "@/db/repositories/ports";

export interface OutboxWriteInput {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  nextRetryAt?: Date | null;
  createdAt?: Date;
}

export class OutboxWriter {
  constructor(private readonly outboxRepository: OutboxRepositoryPort) {}

  async write(input: OutboxWriteInput) {
    return this.outboxRepository.write({
      id: `outbox_${crypto.randomUUID()}`,
      event_type: input.eventType,
      aggregate_type: input.aggregateType,
      aggregate_id: input.aggregateId,
      payload: input.payload,
      status: "pending",
      attempts: 0,
      created_at: input.createdAt ?? new Date(),
    });
  }
}
