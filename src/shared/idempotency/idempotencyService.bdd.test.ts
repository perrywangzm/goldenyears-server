import { describe, expect, it } from "vitest";
import { IdempotencyService, type IdempotencyRecord, type IdempotencyStore } from "./idempotencyService";

class MemoryIdempotencyStore implements IdempotencyStore {
  readonly records: IdempotencyRecord[] = [];

  async find(key: string, userId: string | null, now = new Date()) {
    return this.records.find(
      (record) => record.key === key && record.user_id === userId && record.expires_at > now,
    );
  }

  async create(record: IdempotencyRecord) {
    this.records.push(record);
    return record;
  }
}

describe("Feature: Idempotent mutations", () => {
  it("Scenario: Repeated create commands return the original result", async () => {
    const store = new MemoryIdempotencyStore();
    const service = new IdempotencyService(store);
    const businessRows: Array<{ id: string; name: string }> = [];
    let sequence = 0;

    const executeCreate = () =>
      service.run({
        key: "idem_create_tour_request",
        userId: "user_1",
        requestBody: { facility_id: "facility_1", preferred_date: "2026-06-01" },
        now: new Date("2026-05-18T00:00:00.000Z"),
        execute: async () => {
          sequence += 1;
          const row = { id: `tour_${sequence}`, name: "create_tour_request" };
          businessRows.push(row);
          return row;
        },
      });

    const first = await executeCreate();
    const second = await executeCreate();

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.result).toEqual(first.result);
    expect(businessRows).toHaveLength(1);
    expect(store.records).toHaveLength(1);
  });
});
