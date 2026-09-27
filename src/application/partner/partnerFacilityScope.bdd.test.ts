import { describe, expect, it } from "vitest";
import { createAsyncInMemoryRepositories } from "@/db/repositories";
import { resetInMemoryStore } from "@/db/repositories/inMemoryStore";
import { requirePartnerFacilityScope } from "./partnerFacilityScope";

describe("Partner facility scope", () => {
	it("requires a partner audience and returns the authorized facility context", async () => {
		resetInMemoryStore();
		const repos = createAsyncInMemoryRepositories();
		const ctx = {
			requestId: "req_partner_scope",
			actor: {
				kind: "user" as const,
				userId: "usr_partner_operator",
				sessionId: "sess_partner",
				audience: "partner" as const,
				roles: [],
			},
			now: new Date("2026-07-05T00:00:00.000Z"),
		};

		await expect(
			requirePartnerFacilityScope(
				ctx,
				repos.partnerFacilities,
				"fac_partner_managed",
			),
		).resolves.toMatchObject({
			actor_user_id: "usr_partner_operator",
			facility_id: "fac_partner_managed",
			company_id: "co_partner_demo",
		});

		await expect(
			requirePartnerFacilityScope(
				ctx,
				repos.partnerFacilities,
				"fac_orchid_gardens",
			),
		).rejects.toMatchObject({ code: "facility_not_found", status: 404 });

		await expect(
			requirePartnerFacilityScope(
				{ ...ctx, actor: { ...ctx.actor, audience: "user" as const } },
				repos.partnerFacilities,
				"fac_partner_managed",
			),
		).rejects.toMatchObject({ code: "unauthenticated", status: 401 });
	});
});
