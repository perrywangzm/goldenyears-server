import { describe, expect, it } from "vitest";
import { createAsyncInMemoryRepositories } from "@/db/repositories";
import { createSeededStore } from "@/db/repositories/inMemoryStore";
import { buildTestRequestContext } from "@/shared/testing/builders";
import { PartnerFacilityEditService } from "./partnerFacilityEditService";

const managedFacilityId = "fac_partner_managed";
const otherFacilityId = "fac_orchid_gardens";
const partnerUserId = "usr_partner_operator";
const now = new Date("2026-07-05T07:00:00.000Z");

describe("Feature: Partner facility edit service", () => {
	it("Scenario: Partner edits allowed listing fields for a managed facility", async () => {
		const store = createSeededStore();
		const service = new PartnerFacilityEditService(
			createAsyncInMemoryRepositories(store),
		);

		const result = await service.updateListingFields(partnerCtx(), {
			facility_id: managedFacilityId,
			expected_version: 1,
			patch: {
				tagline: "  A calmer partner page tagline  ",
				highlights: [" Fresh meals ", "", "Garden visits"],
			},
		});

		const facility = store.facilities.find((row) => row.id === managedFacilityId);
		expect(result.editable_fields).toMatchObject({
			tagline: "A calmer partner page tagline",
			highlights: ["Fresh meals", "Garden visits"],
		});
		expect(facility).toMatchObject({
			tagline: "A calmer partner page tagline",
			highlights: ["Fresh meals", "Garden visits"],
			version: 2,
			updated_at: now,
		});
		expect(store.outboxEvents).toHaveLength(0);
	});

	it("Scenario: Locked listing fields fail visibly without mutation", async () => {
		const store = createSeededStore();
		const before = structuredClone(
			store.facilities.find((row) => row.id === managedFacilityId),
		);
		const service = new PartnerFacilityEditService(
			createAsyncInMemoryRepositories(store),
		);

		await expect(
			service.updateListingFields(partnerCtx(), {
				facility_id: managedFacilityId,
				patch: {
					tagline: "Allowed but not applied",
					name: "Unauthorized renamed facility",
					price_from: 1,
				},
			}),
		).rejects.toMatchObject({
			code: "validation_failed",
			status: 422,
			details: { locked_fields: ["name", "price_from"] },
		});

		expect(store.facilities.find((row) => row.id === managedFacilityId)).toEqual(
			before,
		);
		expect(store.auditEvents).toHaveLength(0);
		expect(store.outboxEvents).toHaveLength(0);
	});

	it("Scenario: Availability updates are normalized before persistence", async () => {
		const store = createSeededStore();
		const service = new PartnerFacilityEditService(
			createAsyncInMemoryRepositories(store),
		);

		const result = await service.updateAvailability(partnerCtx(), {
			facility_id: managedFacilityId,
			expected_version: 1,
			availability: {
				status: "full",
				beds_available: 12,
				note: "   ",
			},
		});

		expect(result.availability).toEqual({
			status: "full",
			beds_available: null,
			note: null,
			updated_at: now.toISOString(),
		});
		expect(store.facilities.find((row) => row.id === managedFacilityId)).toMatchObject({
			availability_status: "full",
			beds_available: null,
			availability_note: null,
			availability_updated_at: now,
			version: 2,
		});
	});

	it("Scenario: Tour availability updates are normalized before persistence", async () => {
		const store = createSeededStore();
		const service = new PartnerFacilityEditService(
			createAsyncInMemoryRepositories(store),
		);

		const result = await service.updateTourAvailability(partnerCtx(), {
			facility_id: managedFacilityId,
			expected_version: 1,
			tour_availability: {
				status: "limited",
				timezone: "Asia/Singapore",
				weekly_windows: [
					{ day_of_week: 4, start_time: "14:00", end_time: "16:00" },
					{ day_of_week: 2, start_time: "09:00", end_time: "11:00" },
				],
				exceptions: [
					{
						date: "2026-07-10",
						status: "unavailable",
						windows: [
							{ day_of_week: 5, start_time: "09:00", end_time: "10:00" },
						],
						note: "  Staff training  ",
					},
					{ date: "2026-07-08", status: "limited", windows: [] },
				],
				notes: "  Weekday tours only  ",
			},
		});

		expect(result.tour_availability).toMatchObject({
			status: "limited",
			timezone: "Asia/Singapore",
			weekly_windows: [
				{ day_of_week: 2, start_time: "09:00", end_time: "11:00" },
				{ day_of_week: 4, start_time: "14:00", end_time: "16:00" },
			],
			exceptions: [
				{ date: "2026-07-08", status: "limited", windows: [] },
				{
					date: "2026-07-10",
					status: "unavailable",
					windows: [],
					note: "Staff training",
				},
			],
			notes: "Weekday tours only",
			updated_at: now.toISOString(),
		});
		expect(store.facilities.find((row) => row.id === managedFacilityId)).toMatchObject({
			tour_availability_updated_at: now,
			version: 2,
		});
	});

	it("Scenario: Successful mutations write field-level audit records", async () => {
		const store = createSeededStore();
		const service = new PartnerFacilityEditService(
			createAsyncInMemoryRepositories(store),
		);

		await service.updateListingFields(partnerCtx(), {
			facility_id: managedFacilityId,
			expected_version: 1,
			patch: {
				tagline: "Field audit tagline",
				about: "Field audit about text",
				features: ["med247", "garden"],
			},
		});

		expect(store.auditEvents).toHaveLength(3);
		expect(store.auditEvents.map((event) => event.action)).toEqual([
			"partner.facility_listing_field_updated",
			"partner.facility_listing_field_updated",
			"partner.facility_listing_field_updated",
		]);
		expect(
			store.auditEvents.map(
				(event) => (event.metadata as Record<string, unknown>).field,
			),
		).toEqual(["tagline", "about", "features"]);
		expect(store.auditEvents).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					actor_user_id: partnerUserId,
					resource_type: "facility",
					resource_id: managedFacilityId,
					created_at: now,
				}),
			]),
		);
	});

	it("Scenario: Optimistic version conflicts reject stale writes before audit", async () => {
		const store = createSeededStore();
		const service = new PartnerFacilityEditService(
			createAsyncInMemoryRepositories(store),
		);

		await expect(
			service.updateAvailability(partnerCtx(), {
				facility_id: managedFacilityId,
				expected_version: 99,
				availability: {
					status: "available",
					beds_available: 2,
					note: null,
				},
			}),
		).rejects.toMatchObject({ code: "conflict", status: 409 });

		expect(store.facilities.find((row) => row.id === managedFacilityId)).toMatchObject({
			version: 1,
			availability_status: "available",
			beds_available: 3,
		});
		expect(store.auditEvents).toHaveLength(0);
	});

	it("Scenario: Cross-facility edits are denied before mutation", async () => {
		const store = createSeededStore();
		const before = structuredClone(
			store.facilities.find((row) => row.id === otherFacilityId),
		);
		const service = new PartnerFacilityEditService(
			createAsyncInMemoryRepositories(store),
		);

		await expect(
			service.updateAvailability(partnerCtx(), {
				facility_id: otherFacilityId,
				availability: {
					status: "limited",
					beds_available: 1,
					note: "Should not apply.",
				},
			}),
		).rejects.toMatchObject({ code: "facility_not_found", status: 404 });

		expect(store.facilities.find((row) => row.id === otherFacilityId)).toEqual(
			before,
		);
		expect(store.auditEvents).toHaveLength(0);
		expect(store.outboxEvents).toHaveLength(0);
	});
});

function partnerCtx() {
	return buildTestRequestContext({
		requestId: "req_partner_edit",
		now,
		actor: {
			kind: "user",
			userId: partnerUserId,
			sessionId: "sess_partner",
			audience: "partner",
			roles: [],
		},
	});
}
