import { describe, expect, it } from "vitest";
import { createAsyncInMemoryRepositories } from "@/db/repositories";
import { createSeededStore } from "@/db/repositories/inMemoryStore";
import { AuditRepository } from "@/db/repositories/auditRepository";
import { PartnerFacilityRepository } from "@/db/repositories/partnerFacilityRepository";
import { ReviewRepository } from "@/db/repositories/reviewRepository";
import { TourRepository } from "@/db/repositories/tourRepository";
import type { ReviewRow, TourRequestRow } from "@/db/schema/types";

const managedFacilityId = "fac_partner_managed";
const otherFacilityId = "fac_orchid_gardens";
const partnerUserId = "usr_partner_operator";
const familyUserId = "usr_family_demo";
const baseDate = new Date("2026-06-01T10:00:00.000Z");

describe("Feature: Partner page repositories", () => {
	it("Scenario: Partner facility reads are scoped to active company access", () => {
		const store = createSeededStore();
		const partnerFacilities = new PartnerFacilityRepository(store);
		const tours = new TourRepository(store);
		const reviews = new ReviewRepository(store);
		store.tourRequests.push(
			tourRequest("tour_managed", managedFacilityId, "pending_review"),
		);
		store.reviews.push(review("rev_managed", managedFacilityId));

		const accessible = partnerFacilities.listAccessibleForUser(partnerUserId, {
			limit: 10,
			offset: 0,
		});

		expect(accessible.rows.map((facility) => facility.id)).toEqual([
			managedFacilityId,
		]);
		expect(
			partnerFacilities.findAccessibleForUserAndFacility(
				partnerUserId,
				otherFacilityId,
			),
		).toBeUndefined();
		expect(
			tours.findForFacility({
				facilityId: otherFacilityId,
				tourRequestId: "tour_managed",
			}),
		).toBeUndefined();
		expect(
			reviews.findForFacility({
				facilityId: otherFacilityId,
				reviewId: "rev_managed",
			}),
		).toBeUndefined();
	});

	it("Scenario: Partner facility mutations update only manager-owned fields and versions", () => {
		const store = createSeededStore();
		const partnerFacilities = new PartnerFacilityRepository(store);
		const updatedAt = new Date("2026-06-02T08:00:00.000Z");

		const listing = partnerFacilities.updateManagerListingFields({
			facilityId: managedFacilityId,
			expectedVersion: 1,
			patch: {
				tagline: "A calmer partner page tagline",
				highlights: ["Fresh meals", "Garden visits"],
			},
			updatedAt,
		});
		expect(listing.tagline).toBe("A calmer partner page tagline");
		expect(listing.highlights).toEqual(["Fresh meals", "Garden visits"]);
		expect(listing.version).toBe(2);

		const availability = partnerFacilities.updateAvailability({
			facilityId: managedFacilityId,
			expectedVersion: 2,
			status: "limited",
			bedsAvailable: 1,
			note: "One respite bed opens next week.",
			updatedAt,
		});
		expect(availability.availability_status).toBe("limited");
		expect(availability.availability_updated_at).toEqual(updatedAt);
		expect(availability.version).toBe(3);

		const tourAvailability = { status: "limited", weekly_windows: [] };
		const tour = partnerFacilities.updateTourAvailability({
			facilityId: managedFacilityId,
			expectedVersion: 3,
			tourAvailability,
			updatedAt,
		});
		expect(tour.tour_availability).toEqual(tourAvailability);
		expect(tour.tour_availability_updated_at).toEqual(updatedAt);
		expect(tour.version).toBe(4);
	});

	it("Scenario: Optimistic version conflicts reject stale partner writes", async () => {
		const repos = createAsyncInMemoryRepositories(createSeededStore());

		await expect(
			repos.partnerFacilities.updateAvailability({
				facilityId: managedFacilityId,
				expectedVersion: 99,
				status: "available",
				bedsAvailable: 2,
				note: null,
				updatedAt: baseDate,
			}),
		).rejects.toMatchObject({ code: "conflict", status: 409 });
	});

	it("Scenario: Partner tour list pagination and summaries are facility-scoped", async () => {
		const store = createSeededStore();
		store.tourRequests.push(
			tourRequest("tour_1", managedFacilityId, "pending_review", 1),
			tourRequest("tour_2", managedFacilityId, "confirmed", 2),
			tourRequest("tour_3", managedFacilityId, "attended", 3),
			tourRequest("tour_other", otherFacilityId, "pending_review", 4),
		);
		const repos = createAsyncInMemoryRepositories(store);

		const firstPage = await repos.tours.listForFacility({
			facilityId: managedFacilityId,
			limit: 2,
			offset: 0,
		});
		const secondPage = await repos.tours.listForFacility({
			facilityId: managedFacilityId,
			limit: 2,
			offset: 2,
		});
		const summary = await repos.tours.summarizeForFacility(managedFacilityId);

		expect(firstPage.total).toBe(3);
		expect(firstPage.hasMore).toBe(true);
		expect(firstPage.rows.map((tour) => tour.id)).toEqual(["tour_3", "tour_2"]);
		expect(secondPage.hasMore).toBe(false);
		expect(secondPage.rows.map((tour) => tour.id)).toEqual(["tour_1"]);
		expect(summary).toEqual({
			pending_review: 1,
			confirmed: 1,
			attended: 1,
			no_show: 0,
			declined: 0,
			cancelled: 0,
		});
	});

	it("Scenario: Partner tour status updates are scoped and versioned", async () => {
		const store = createSeededStore();
		store.tourRequests.push(
			tourRequest("tour_update", managedFacilityId, "pending_review"),
		);
		const repos = createAsyncInMemoryRepositories(store);

		const updated = await repos.tours.updateStatus({
			facilityId: managedFacilityId,
			tourRequestId: "tour_update",
			status: "confirmed",
			expectedVersion: 1,
			updatedAt: baseDate,
		});

		expect(updated.status).toBe("confirmed");
		expect(updated.version).toBe(2);
		await expect(
			repos.tours.updateStatus({
				facilityId: otherFacilityId,
				tourRequestId: "tour_update",
				status: "cancelled",
				expectedVersion: 2,
				updatedAt: baseDate,
			}),
		).rejects.toMatchObject({ code: "not_found", status: 404 });
	});

	it("Scenario: Review responses are unique per review and can be updated", async () => {
		const store = createSeededStore();
		store.reviews.push(review("rev_response", managedFacilityId));
		const repos = createAsyncInMemoryRepositories(store);

		const created = await repos.reviews.createResponse({
			facilityId: managedFacilityId,
			reviewId: "rev_response",
			responderUserId: partnerUserId,
			body: "Thank you for visiting us.",
			now: baseDate,
		});
		expect(created.version).toBe(1);

		await expect(
			repos.reviews.createResponse({
				facilityId: managedFacilityId,
				reviewId: "rev_response",
				responderUserId: partnerUserId,
				body: "Duplicate response",
				now: baseDate,
			}),
		).rejects.toMatchObject({ code: "conflict", status: 409 });

		const updated = await repos.reviews.updateResponse({
			facilityId: managedFacilityId,
			reviewId: "rev_response",
			responderUserId: partnerUserId,
			body: "We appreciate your kind words.",
			expectedVersion: 1,
			now: new Date("2026-06-03T10:00:00.000Z"),
		});
		expect(updated.body).toBe("We appreciate your kind words.");
		expect(updated.version).toBe(2);
	});

	it("Scenario: Duplicate pending review flags are rejected", async () => {
		const store = createSeededStore();
		store.reviews.push(review("rev_flag", managedFacilityId));
		const repos = createAsyncInMemoryRepositories(store);

		await repos.reviews.createFlag({
			facilityId: managedFacilityId,
			reviewId: "rev_flag",
			flaggedByUserId: partnerUserId,
			reason: "inaccurate_info",
			details: "The room type is outdated.",
			now: baseDate,
		});

		await expect(
			repos.reviews.createFlag({
				facilityId: managedFacilityId,
				reviewId: "rev_flag",
				flaggedByUserId: partnerUserId,
				reason: "inaccurate_info",
				details: "Still outdated.",
				now: baseDate,
			}),
		).rejects.toMatchObject({ code: "conflict", status: 409 });
	});

	it("Scenario: Partner audit reads support resource pagination and action filters", () => {
		const store = createSeededStore();
		const audit = new AuditRepository(store);
		store.auditEvents.push(
			auditEvent("aud_1", "facility", managedFacilityId, "availability_update", 1),
			auditEvent("aud_2", "facility", managedFacilityId, "listing_update", 2),
			auditEvent("aud_3", "facility", managedFacilityId, "availability_update", 3),
			auditEvent("aud_other", "facility", otherFacilityId, "availability_update", 4),
		);

		const page = audit.listForResource({
			resourceType: "facility",
			resourceId: managedFacilityId,
			actions: ["availability_update"],
			limit: 1,
			offset: 0,
		});

		expect(page.total).toBe(2);
		expect(page.hasMore).toBe(true);
		expect(page.rows.map((event) => event.id)).toEqual(["aud_3"]);
	});
});

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

function review(id: string, facilityId: string): ReviewRow {
	return {
		id,
		facility_id: facilityId,
		author_name: "Family Reviewer",
		relationship: "Daughter",
		rating: 5,
		title: "Helpful team",
		body: "The staff were responsive and clear.",
		review_date: "2026-05-20",
		verified: true,
		status: "published",
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
