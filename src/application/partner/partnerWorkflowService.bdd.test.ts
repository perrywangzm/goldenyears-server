import { describe, expect, it } from "vitest";
import { createAsyncInMemoryRepositories } from "@/db/repositories";
import {
	createInMemoryTransactionRunner,
	createSeededStore,
} from "@/db/repositories/inMemoryStore";
import type { ReviewRow, TourRequestRow } from "@/db/schema/types";
import {
	buildTestRequestContext,
	buildUserActor,
} from "@/shared/testing/builders";
import { PartnerWorkflowService } from "./partnerWorkflowService";

function createService(store: ReturnType<typeof createSeededStore>) {
	return new PartnerWorkflowService(
		createAsyncInMemoryRepositories(store),
		createInMemoryTransactionRunner(store),
	);
}

const managedFacilityId = "fac_partner_managed";
const otherFacilityId = "fac_orchid_gardens";
const partnerUserId = "usr_partner_operator";
const familyUserId = "usr_family_demo";
const baseDate = new Date("2026-07-05T02:00:00.000Z");

describe("Feature: Partner workflow service", () => {
	it("Scenario: Partner tour list returns facility-scoped projections", async () => {
		const store = createSeededStore();
		store.tourRequests.push(
			tourRequest("tour_old", managedFacilityId, "pending_review", 0),
			tourRequest("tour_new", managedFacilityId, "confirmed", 1),
			tourRequest("tour_other", otherFacilityId, "pending_review", 2),
		);
		const service = createService(store);

		const result = await service.listFacilityTourRequests(partnerCtx(), {
			facility_id: managedFacilityId,
			limit: 1,
			offset: 0,
		});

		expect(result.data).toHaveLength(1);
		expect(result.data[0]).toMatchObject({
			id: "tour_new",
			facility_id: managedFacilityId,
			status: "confirmed",
		});
		expect(result.page).toEqual({
			type: "offset",
			limit: 1,
			offset: 0,
			has_more: true,
			total_count: 2,
		});
	});

	for (const tourCase of [
		{
			name: "confirmation",
			initialStatus: "pending_review" as const,
			finalStatus: "confirmed" as const,
			eventType: "tour_request.confirmed",
			act: (
				service: PartnerWorkflowService,
				ctx: ReturnType<typeof partnerCtx>,
			) =>
				service.createTourRequestConfirmation(ctx, {
					facility_id: managedFacilityId,
					tour_request_id: "tour_action",
					expected_version: 1,
					scheduled_date: "2026-07-08",
					scheduled_time: "10:00",
				}),
		},
		{
			name: "decline",
			initialStatus: "pending_review" as const,
			finalStatus: "declined" as const,
			eventType: "tour_request.declined",
			act: (
				service: PartnerWorkflowService,
				ctx: ReturnType<typeof partnerCtx>,
			) =>
				service.createTourRequestDecline(ctx, {
					facility_id: managedFacilityId,
					tour_request_id: "tour_action",
					expected_version: 1,
					reason: "No matching slot.",
				}),
		},
		{
			name: "attendance",
			initialStatus: "confirmed" as const,
			finalStatus: "attended" as const,
			eventType: "tour_request.attended",
			act: (
				service: PartnerWorkflowService,
				ctx: ReturnType<typeof partnerCtx>,
			) =>
				service.createTourRequestAttendance(ctx, {
					facility_id: managedFacilityId,
					tour_request_id: "tour_action",
					expected_version: 1,
					attended_at: "2026-07-08T02:00:00.000Z",
				}),
		},
		{
			name: "no-show",
			initialStatus: "confirmed" as const,
			finalStatus: "no_show" as const,
			eventType: "tour_request.no_show",
			act: (
				service: PartnerWorkflowService,
				ctx: ReturnType<typeof partnerCtx>,
			) =>
				service.createTourRequestNoShow(ctx, {
					facility_id: managedFacilityId,
					tour_request_id: "tour_action",
					expected_version: 1,
					note: "Family did not arrive.",
				}),
		},
		{
			name: "cancellation",
			initialStatus: "confirmed" as const,
			finalStatus: "cancelled" as const,
			eventType: "tour_request.cancelled",
			act: (
				service: PartnerWorkflowService,
				ctx: ReturnType<typeof partnerCtx>,
			) =>
				service.createTourRequestCancellation(ctx, {
					facility_id: managedFacilityId,
					tour_request_id: "tour_action",
					expected_version: 1,
					reason: "Family requested a later date.",
				}),
		},
	]) {
		it(`Scenario: Partner tour ${tourCase.name} writes audit and outbox`, async () => {
			const store = createSeededStore();
			store.tourRequests.push(
				tourRequest("tour_action", managedFacilityId, tourCase.initialStatus),
			);
			const service = createService(store);
			const ctx = partnerCtx({ idempotencyKey: `idem_${tourCase.name}` });

			const result = await tourCase.act(service, ctx);

			expect(result.status).toBe(tourCase.finalStatus);
			if (tourCase.name === "confirmation") {
				expect(result).toMatchObject({
					scheduled_date: "2026-07-08",
					scheduled_time: "10:00",
				});
				expect(store.tourRequests[0]).toMatchObject({
					scheduled_date: "2026-07-08",
					scheduled_time: "10:00",
				});
			}
			expect(store.tourRequests[0]).toMatchObject({
				status: tourCase.finalStatus,
				version: 2,
				updated_at: baseDate,
			});
			expect(store.auditEvents).toHaveLength(1);
			expect(store.auditEvents[0]).toMatchObject({
				actor_user_id: partnerUserId,
				resource_type: "tour_request",
				resource_id: "tour_action",
			});
			expect(store.outboxEvents).toHaveLength(1);
			expect(store.outboxEvents[0]).toMatchObject({
				event_type: tourCase.eventType,
				aggregate_type: "tour_request",
				aggregate_id: "tour_action",
			});
		});
	}

	it("Scenario: Duplicate tour action idempotency replays without extra side effects", async () => {
		const store = createSeededStore();
		store.tourRequests.push(
			tourRequest("tour_idempotent", managedFacilityId, "pending_review"),
		);
		const service = createService(store);
		const ctx = partnerCtx({ idempotencyKey: "idem_confirm_tour" });
		const input = {
			facility_id: managedFacilityId,
			tour_request_id: "tour_idempotent",
			expected_version: 1,
		};

		const first = await service.createTourRequestConfirmation(ctx, input);
		const replay = await service.createTourRequestConfirmation(ctx, input);

		expect(first).toEqual(replay);
		expect(store.tourRequests[0].status).toBe("confirmed");
		expect(store.auditEvents).toHaveLength(1);
		expect(store.outboxEvents).toHaveLength(1);
	});

	it("Scenario: Invalid partner tour transitions return conflict", async () => {
		const store = createSeededStore();
		store.tourRequests.push(
			tourRequest("tour_invalid", managedFacilityId, "pending_review"),
		);
		const service = createService(store);

		await expect(
			service.createTourRequestAttendance(partnerCtx(), {
				facility_id: managedFacilityId,
				tour_request_id: "tour_invalid",
				expected_version: 1,
			}),
		).rejects.toMatchObject({ code: "conflict", status: 409 });

		expect(store.tourRequests[0].status).toBe("pending_review");
		expect(store.auditEvents).toHaveLength(0);
		expect(store.outboxEvents).toHaveLength(0);
	});

	it("Scenario: Cross-facility tour actions are denied before mutation", async () => {
		const store = createSeededStore();
		store.tourRequests.push(
			tourRequest("tour_cross_facility", managedFacilityId, "pending_review"),
		);
		const service = createService(store);

		await expect(
			service.createTourRequestConfirmation(partnerCtx(), {
				facility_id: otherFacilityId,
				tour_request_id: "tour_cross_facility",
				expected_version: 1,
			}),
		).rejects.toMatchObject({ code: "facility_not_found", status: 404 });

		expect(store.tourRequests[0].status).toBe("pending_review");
		expect(store.auditEvents).toHaveLength(0);
		expect(store.outboxEvents).toHaveLength(0);
	});

	it("Scenario: Review response create and update attach to partner reviews", async () => {
		const store = createSeededStore();
		store.reviews.push(review("rev_response", managedFacilityId));
		const service = createService(store);

		const created = await service.createFacilityReviewResponse(
			partnerCtx({ idempotencyKey: "idem_create_response" }),
			{
				facility_id: managedFacilityId,
				review_id: "rev_response",
				body: "Thank you for visiting us.",
			},
		);
		const updated = await service.updateFacilityReviewResponse(
			partnerCtx({ idempotencyKey: "idem_update_response" }),
			{
				facility_id: managedFacilityId,
				review_id: "rev_response",
				body: "We appreciate your kind words.",
				expected_version: 1,
			},
		);
		const listed = await service.listFacilityReviews(partnerCtx(), {
			facility_id: managedFacilityId,
			limit: 10,
			offset: 0,
		});

		expect(created.response).toMatchObject({
			review_id: "rev_response",
			body: "Thank you for visiting us.",
			version: 1,
		});
		expect(updated.response).toMatchObject({
			review_id: "rev_response",
			body: "We appreciate your kind words.",
			version: 2,
		});
		expect(listed.data.find((row) => row.id === "rev_response")).toMatchObject({
			response: {
				body: "We appreciate your kind words.",
				version: 2,
			},
		});
		expect(store.auditEvents.map((event) => event.action)).toEqual([
			"partner_create_review_response",
			"partner_update_review_response",
		]);
		expect(store.outboxEvents.map((event) => event.event_type)).toEqual([
			"review_response.created",
			"review_response.updated",
		]);
	});

	it("Scenario: Tour confirmation persists scheduled fields on the tour request", async () => {
		const store = createSeededStore();
		store.tourRequests.push(
			tourRequest("tour_confirm_fields", managedFacilityId, "pending_review"),
		);
		const service = createService(store);

		const result = await service.createTourRequestConfirmation(
			partnerCtx({ idempotencyKey: "idem_confirm_fields" }),
			{
				facility_id: managedFacilityId,
				tour_request_id: "tour_confirm_fields",
				expected_version: 1,
				scheduled_date: "2026-07-08",
				scheduled_time: "10:00",
				message: "See you then.",
			},
		);

		expect(result).toMatchObject({
			status: "confirmed",
			scheduled_date: "2026-07-08",
			scheduled_time: "10:00",
			partner_message: "See you then.",
		});
		expect(store.tourRequests[0]).toMatchObject({
			status: "confirmed",
			scheduled_date: "2026-07-08",
			scheduled_time: "10:00",
			partner_message: "See you then.",
			version: 2,
		});
	});

	it("Scenario: Tour action rolls back when outbox write fails", async () => {
		const store = createSeededStore();
		store.tourRequests.push(
			tourRequest("tour_rollback", managedFacilityId, "pending_review"),
		);
		const repos = createAsyncInMemoryRepositories(store);
		const failingRepos = {
			...repos,
			outbox: {
				write: async () => {
					throw new Error("outbox unavailable");
				},
			},
		};
		const service = new PartnerWorkflowService(
			failingRepos,
			createInMemoryTransactionRunner(store),
		);

		await expect(
			service.createTourRequestConfirmation(partnerCtx(), {
				facility_id: managedFacilityId,
				tour_request_id: "tour_rollback",
				expected_version: 1,
			}),
		).rejects.toThrow("outbox unavailable");

		expect(store.tourRequests[0]).toMatchObject({
			status: "pending_review",
			version: 1,
		});
		expect(store.auditEvents).toHaveLength(0);
		expect(store.outboxEvents).toHaveLength(0);
	});

	it("Scenario: Duplicate review flags are rejected and do not hide reviews", async () => {
		const store = createSeededStore();
		store.reviews.push(review("rev_flag", managedFacilityId));
		const service = createService(store);

		const flag = await service.createReviewFlag(partnerCtx(), {
			facility_id: managedFacilityId,
			review_id: "rev_flag",
			reason: "inaccurate_info",
			details: "The room type shown is outdated.",
		});
		const listed = await service.listFacilityReviews(partnerCtx(), {
			facility_id: managedFacilityId,
			limit: 10,
			offset: 0,
		});

		await expect(
			service.createReviewFlag(partnerCtx(), {
				facility_id: managedFacilityId,
				review_id: "rev_flag",
				reason: "inaccurate_info",
				details: "Still outdated.",
			}),
		).rejects.toMatchObject({ code: "conflict", status: 409 });

		expect(flag).toMatchObject({
			review_id: "rev_flag",
			facility_id: managedFacilityId,
			reason: "inaccurate_info",
			status: "pending",
		});
		expect(listed.data.find((row) => row.id === "rev_flag")).toMatchObject({
			status: "published",
			flags: {
				pending_count: 1,
				current_user_pending: true,
			},
		});
		expect(store.reviewFlags).toHaveLength(1);
		expect(store.auditEvents).toHaveLength(1);
		expect(store.outboxEvents).toHaveLength(1);
	});
});

function partnerCtx(
	overrides: Partial<Parameters<typeof buildTestRequestContext>[0]> = {},
) {
	return buildTestRequestContext({
		now: baseDate,
		actor: buildUserActor({
			userId: partnerUserId,
			sessionId: "sess_partner",
			audience: "partner",
		}),
		...overrides,
	});
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
		preferred_date: "2026-07-08",
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
		review_date: "2026-06-20",
		verified: true,
		status: "published",
		version: 1,
		created_at: baseDate,
		updated_at: baseDate,
	};
}
