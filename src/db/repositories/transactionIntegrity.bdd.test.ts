import { describe, expect, it } from "vitest";
import { TestTransactionDatabase } from "@/db/testing/testDatabase";
import { AuditRepository } from "./auditRepository";
import { FacilityRepository } from "./facilityRepository";

describe("Feature: Transaction integrity", () => {
  it("Scenario: A repository transaction rolls back every write on failure", async () => {
    const db = new TestTransactionDatabase();
    const facilityId = "fac_orchid_gardens";
    const originalName = new FacilityRepository(db.store).findPublicById(facilityId).name;

    await expect(
      db.transaction(async (store) => {
        const facility = store.facilities.find((row) => row.id === facilityId);
        if (!facility) {
          throw new Error("fixture missing");
        }

        facility.name = "Changed inside transaction";
        facility.version += 1;

        new AuditRepository(store).write({
          id: "aud_failure_case",
          actor_user_id: "usr_family_demo",
          action: "update_facility",
          resource_type: "facility",
          resource_id: facilityId,
          metadata: { name: facility.name },
          created_at: new Date(),
        });

        throw new Error("later write failed");
      }),
    ).rejects.toThrow("later write failed");

    expect(new FacilityRepository(db.store).findPublicById(facilityId).name).toBe(originalName);
    expect(db.store.auditEvents).toHaveLength(0);
  });
});
