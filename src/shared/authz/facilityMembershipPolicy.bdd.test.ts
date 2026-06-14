import { describe, expect, it } from "vitest";
import { ApiError } from "@/shared/errors/apiError";
import type { RequestContext } from "@/shared/request-context/context";
import {
  assertCanManageFacility,
  StaticFacilityMembershipPolicy,
} from "./facilityMembershipPolicy";

describe("Facility membership authorization", () => {
  it("allows facility managers to act only on managed facilities", () => {
    const ctx: RequestContext = {
      requestId: "req_test",
      actor: {
        kind: "user",
        userId: "usr_manager",
        sessionId: "sess_manager",
        roles: ["facility_manager"],
      },
      now: new Date("2026-05-18T00:00:00.000Z"),
    };
    const policy = new StaticFacilityMembershipPolicy([
      {
        user_id: "usr_manager",
        facility_id: "fac_a",
        role: "manager",
        status: "active",
      },
    ]);
    const writes: string[] = [];

    expect(assertCanManageFacility(ctx, "fac_a", policy)).toBe("usr_manager");
    expect(() => {
      assertCanManageFacility(ctx, "fac_b", policy);
      writes.push("fac_b");
    }).toThrow(ApiError);
    expect(writes).toEqual([]);
  });
});
