import { describe, expect, it } from "vitest";
import { PartnerDashboardService } from "@/application/partner/partnerDashboardService";
import { createAsyncInMemoryRepositories } from "@/db/repositories";
import { createSeededStore } from "@/db/repositories/inMemoryStore";
import type { ReviewRow, TourRequestRow } from "@/db/schema/types";
import type { RequestContext } from "@/shared/request-context/context";

const managedFacilityId = "fac_partner_managed";
const otherFacilityId = "fac_orchid_gardens";
const partnerUserId = "usr_partner_operator";
const familyUserId = "usr_family_demo";
const baseDate = new Date("2026-06-01T10:00:00.000Z");

describe("Feature: Partner dashboard service", () => {
	it("Scenario: A managed facility dashboard loads without frontend waterfalls", async () => {
		const store = createSeededStore();
		store.tourRequests.push(
			tourRequest("tour_pending", managedFacilityId, "pending_review", 1),
			tourRequest("tour_confirmed", managedFacilityId, "confirmed", 2),
			tourRequest("tour_other", otherFacilityId, "pending_review", 3),
		);
		store.auditEvents.push(
			auditEvent("aud_listing", "facility", managedFacilityId, "listing_update", 2),
			auditEvent("aud_other", "facility", otherFacilityId, "listing_update", 3),
		);
		const service = new PartnerDashboardService(
			createAsyncInMemoryRepositories(store),
		);

		const dashboard = await service.getFacilityManagerDashboard(partnerCtx(), {
			facility_id: managedFacilityId,
		});

		expect(dashboard.facility).toMatchObject({
			id: managedFacilityId,
			company_id: "co_partner_demo",
			name: "Partner Managed Home",
		});
		expect(dashboard.permissions).toEqual({
			can_edit_listing: true,
			can_update_availability: true,
			can_update_tour_availability: true,
			can_manage_tours: true,
			can_respond_to_reviews: true,
			can_flag_reviews: true,
		});
		expect(dashboard.editable_fields).toMatchObject({
			tagline: "Resort-style independent living in the heart of Bukit Timah.",
		});
		expect(dashboard.locked_fields).toMatchObject({
			name: "Partner Managed Home",
			licence: "MOH-RH-2018-014",
		});
		expect(dashboard.availability).toMatchObject({
			status: "available",
			beds_available: 3,
		});
		expect(dashboard.tour_availability).toMatchObject({
			status: "available",
			timezone: "Asia/Singapore",
		});
		expect(dashboard.tour_summary).toMatchObject({
			pending_review: 1,
			confirmed: 1,
		});
		expect(dashboard.recent_tour_requests.map((tour) => tour.id)).toEqual([
			"tour_confirmed",
			"tour_pending",
		]);
		expect(dashboard.recent_edits.map((event) => event.id)).toEqual([
			"aud_listing",
		]);
		expect(dashboard.reference_data.features).toContainEqual({
			id: "med247",
			name: "24/7 medical staff",
		});
		expect(dashboard.reference_data.languages).toContainEqual({
			id: "english",
			name: "English",
		});
	});

	it("Scenario: Cross-facility and inactive partner access are rejected", async () => {
		const store = createSeededStore();
		const service = new PartnerDashboardService(
			createAsyncInMemoryRepositories(store),
		);

		await expect(
			service.getFacilityManagerDashboard(partnerCtx(), {
				facility_id: otherFacilityId,
			}),
		).rejects.toMatchObject({ code: "facility_not_found", status: 404 });
		await expect(
			service.getFacilityAnalytics(partnerCtx(), {
				facility_id: otherFacilityId,
			}),
		).rejects.toMatchObject({ code: "facility_not_found", status: 404 });
		await expect(
			service.listFacilityAuditEvents(partnerCtx(), {
				facility_id: otherFacilityId,
				limit: 20,
				offset: 0,
			}),
		).rejects.toMatchObject({ code: "facility_not_found", status: 404 });

		const membership = store.companyUsers.find(
			(row) => row.user_id === partnerUserId,
		);
		if (!membership) throw new Error("Expected seeded partner membership.");
		membership.status = "disabled";

		await expect(
			service.getFacilityManagerDashboard(partnerCtx(), {
				facility_id: managedFacilityId,
			}),
		).rejects.toMatchObject({ code: "facility_not_found", status: 404 });
		await expect(
			service.getFacilityManagerDashboard(
				{
					...partnerCtx(),
					actor: { ...partnerCtx().actor, audience: "user" },
				},
				{ facility_id: managedFacilityId },
			),
		).rejects.toMatchObject({ code: "unauthenticated", status: 401 });
	});

	it("Scenario: Lightweight analytics are derived from scoped server data", async () => {
		const store = createSeededStore();
		store.reviews.push(
			review("rev_managed_1", managedFacilityId, 4, "2026-06-01"),
			review("rev_managed_2", managedFacilityId, 5, "2026-06-03"),
			review("rev_hidden", managedFacilityId, 1, "2026-06-02", "hidden"),
			review("rev_other", otherFacilityId, 1, "2026-06-02"),
		);
		store.tourRequests.push(
			tourRequest("tour_pending", managedFacilityId, "pending_review", 1),
			tourRequest("tour_confirmed", managedFacilityId, "confirmed", 2),
			tourRequest("tour_declined", managedFacilityId, "declined", 2),
			tourRequest("tour_other", otherFacilityId, "confirmed", 2),
		);
		const service = new PartnerDashboardService(
			createAsyncInMemoryRepositories(store),
		);

		const analytics = await service.getFacilityAnalytics(partnerCtx(), {
			facility_id: managedFacilityId,
			from: "2026-06-01T00:00:00.000Z",
			to: "2026-06-04T00:00:00.000Z",
		});

		expect(analytics).toEqual({
			facility_id: managedFacilityId,
			period: {
				from: "2026-06-01T00:00:00.000Z",
				to: "2026-06-04T00:00:00.000Z",
			},
			metrics: {
				review_count: 2,
				average_rating: 4.5,
				pending_tour_requests: 1,
				confirmed_tour_requests: 1,
			},
		});
	});

	it("Scenario: Partner audit event lists are facility-scoped, filtered, and paginated", async () => {
		const store = createSeededStore();
		store.auditEvents.push(
			auditEvent(
				"aud_1",
				"facility",
				managedFacilityId,
				"availability_update",
				1,
			),
			auditEvent("aud_2", "facility", managedFacilityId, "listing_update", 2),
			auditEvent(
				"aud_3",
				"facility",
				managedFacilityId,
				"availability_update",
				3,
			),
			auditEvent(
				"aud_other",
				"facility",
				otherFacilityId,
				"availability_update",
				4,
			),
		);
		const service = new PartnerDashboardService(
			createAsyncInMemoryRepositories(store),
		);

		const page = await service.listFacilityAuditEvents(partnerCtx(), {
			facility_id: managedFacilityId,
			actions: ["availability_update"],
			limit: 1,
			offset: 0,
		});

		expect(page.data.map((event) => event.id)).toEqual(["aud_3"]);
		expect(page.page).toEqual({
			type: "offset",
			limit: 1,
			offset: 0,
			has_more: true,
			total_count: 2,
		});
		expect(page.data[0]).toMatchObject({
			resource_type: "facility",
			resource_id: managedFacilityId,
			action: "availability_update",
		});
	});
});

function partnerCtx(): RequestContext {
	return {
		requestId: "req_partner_dashboard",
		actor: {
			kind: "user",
			userId: partnerUserId,
			sessionId: "sess_partner",
			audience: "partner",
			roles: [],
		},
		now: baseDate,
		source: "test",
	};
}

function tourRequest(
	id: string,
	facilityId: string,
	status: TourRequestRow["status"],
	dayOffset = 0,
): TourRequestRow {
	const createdAt = new Date(baseDate.getTime() + dayOffset * 86_400_000);
	return {
		id,
		user_id: familyUserId,
		facility_id: facilityId,
		status,
		contact_name: "Family Demo",
		contact_phone: "+65 6000 0000",
		contact_email: "family@example.com",
		preferred_date: "2026-06-10",
		preferred_time: "10:00",
		care_notes: null,
		scheduled_date: null,
		scheduled_time: null,
		partner_message: null,
		version: 1,
		created_at: createdAt,
		updated_at: createdAt,
	};
}

function review(
	id: string,
	facilityId: string,
	rating: number,
	reviewDate: string,
	status: ReviewRow["status"] = "published",
): ReviewRow {
	return {
		id,
		facility_id: facilityId,
		author_name: "Family Reviewer",
		relationship: "Daughter",
		rating,
		title: "Helpful team",
		body: "The staff were responsive and clear.",
		review_date: reviewDate,
		verified: true,
		status,
		version: 1,
		created_at: baseDate,
		updated_at: baseDate,
	};
}

function auditEvent(
	id: string,
	resourceType: string,
	resourceId: string,
	action: string,
	dayOffset: number,
) {
	const createdAt = new Date(baseDate.getTime() + dayOffset * 86_400_000);
	return {
		id,
		actor_user_id: partnerUserId,
		action,
		resource_type: resourceType,
		resource_id: resourceId,
		metadata: {},
		created_at: createdAt,
	};
}
