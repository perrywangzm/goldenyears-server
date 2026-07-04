import { describe, expect, it } from "vitest";
import { createAsyncInMemoryRepositories } from "@/db/repositories";
import { resetInMemoryStore } from "@/db/repositories/inMemoryStore";
import { authorizeCompanyFacility, requireActiveCompanyUser } from "./policies";

describe("Company authorization", () => {
  it("allows active partner members to access only facilities assigned to their active companies", async () => {
    resetInMemoryStore();
    const repos = createAsyncInMemoryRepositories();
    const ctx = {
      requestId: "req_partner",
      actor: {
        kind: "user" as const,
        userId: "usr_partner_operator",
        sessionId: "sess_partner",
        audience: "partner" as const,
        roles: [],
      },
      now: new Date("2026-06-28T00:00:00.000Z"),
    };

    await expect(requireActiveCompanyUser(ctx, "co_partner_demo", repos.companyUsers)).resolves.toBe(
      "usr_partner_operator",
    );
    await expect(
      authorizeCompanyFacility(ctx, "fac_partner_managed", repos.partnerFacilities),
    ).resolves.toMatchObject({ company_id: "co_partner_demo" });
    await expect(
      authorizeCompanyFacility(ctx, "fac_orchid_gardens", repos.partnerFacilities),
    ).rejects.toMatchObject({ code: "facility_not_found", status: 404 });
  });
});
