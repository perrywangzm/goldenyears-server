import { describe, expect, it } from "vitest";
import { AuditWriter } from "@/shared/audit/auditWriter";
import { OutboxWriter } from "@/shared/outbox/outboxWriter";
import { buildTestRequestContext } from "@/shared/testing/builders";
import { InMemoryTransactionRunner, type SnapshotTransactionStore } from "./transactionRunner";

interface WorkflowStoreShape {
  businessRows: Array<{ id: string }>;
  auditEvents: unknown[];
  outboxEvents: unknown[];
}

class WorkflowStore implements SnapshotTransactionStore {
  businessRows: WorkflowStoreShape["businessRows"] = [];
  auditEvents: WorkflowStoreShape["auditEvents"] = [];
  outboxEvents: WorkflowStoreShape["outboxEvents"] = [];

  snapshot(): WorkflowStoreShape {
    return structuredClone({
      businessRows: this.businessRows,
      auditEvents: this.auditEvents,
      outboxEvents: this.outboxEvents,
    });
  }

  restore(snapshot: unknown): void {
    const restored = snapshot as WorkflowStoreShape;
    this.businessRows = restored.businessRows;
    this.auditEvents = restored.auditEvents;
    this.outboxEvents = restored.outboxEvents;
  }
}

describe("Feature: Atomic workflow side effects", () => {
  it("Scenario: Business change, audit, and outbox commit together", async () => {
    const store = new WorkflowStore();
    const transactionRunner = new InMemoryTransactionRunner(store);
    const ctx = buildTestRequestContext();
    const auditWriter = new AuditWriter({ write: (event: unknown) => store.auditEvents.push(event) && event } as never);
    const outboxWriter = new OutboxWriter({ write: (event: unknown) => store.outboxEvents.push(event) && event } as never);

    await transactionRunner.run(async () => {
      store.businessRows.push({ id: "tour_request_1" });
      auditWriter.write(ctx, {
        action: "create_tour_request",
        resourceType: "tour_request",
        resourceId: "tour_request_1",
      });
      outboxWriter.write({
        eventType: "tour_request.created",
        aggregateType: "tour_request",
        aggregateId: "tour_request_1",
        payload: { id: "tour_request_1" },
      });
    });

    expect(store.businessRows).toHaveLength(1);
    expect(store.auditEvents).toHaveLength(1);
    expect(store.outboxEvents).toHaveLength(1);

    await expect(
      transactionRunner.run(async () => {
        store.businessRows.push({ id: "tour_request_2" });
        auditWriter.write(ctx, {
          action: "create_tour_request",
          resourceType: "tour_request",
          resourceId: "tour_request_2",
        });
        throw new Error("outbox unavailable");
      }),
    ).rejects.toThrow("outbox unavailable");

    expect(store.businessRows).toEqual([{ id: "tour_request_1" }]);
    expect(store.auditEvents).toHaveLength(1);
    expect(store.outboxEvents).toHaveLength(1);
  });
});
