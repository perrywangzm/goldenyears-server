import {
	toPartnerReviewSummary,
	toPartnerTourRequestSummary,
	type PartnerReviewSummary,
	type PartnerTourRequestSummary,
} from "@/db/projections/partnerFacilityProjection";
import type { Repositories } from "@/db/repositories/ports";
import type { ReviewFlagRow, ReviewRow, TourRequestRow } from "@/db/schema/types";
import { assertTourTransitionAllowed } from "@/domain/tour-state/tourStateMachine";
import { AuditWriter } from "@/shared/audit/auditWriter";
import { ApiError } from "@/shared/errors/apiError";
import { IdempotencyService } from "@/shared/idempotency/idempotencyService";
import { OutboxWriter } from "@/shared/outbox/outboxWriter";
import type { RequestContext } from "@/shared/request-context/context";
import { TransactionRunner } from "@/shared/transactions/transactionRunner";
import { requirePartnerFacilityScope } from "./partnerFacilityScope";

type PartnerTourStatus = TourRequestRow["status"];
type PartnerReviewStatus = ReviewRow["status"];
type ReviewFlagReason = ReviewFlagRow["reason"];

interface OffsetPageInput {
	limit: number;
	offset: number;
}

interface PartnerFacilityInput {
	facility_id: string;
}

interface PartnerTourActionBaseInput extends PartnerFacilityInput {
	tour_request_id: string;
	expected_version?: number;
}

export interface PartnerListFacilityTourRequestsInput
	extends PartnerFacilityInput,
		OffsetPageInput {
	statuses?: PartnerTourStatus[];
}

export interface PartnerCreateTourRequestConfirmationInput
	extends PartnerTourActionBaseInput {
	scheduled_date?: string;
	scheduled_time?: string;
	message?: string | null;
}

export interface PartnerCreateTourRequestDeclineInput
	extends PartnerTourActionBaseInput {
	reason?: string | null;
	message?: string | null;
}

export interface PartnerCreateTourRequestAttendanceInput
	extends PartnerTourActionBaseInput {
	attended_at?: string;
	note?: string | null;
}

export interface PartnerCreateTourRequestNoShowInput
	extends PartnerTourActionBaseInput {
	note?: string | null;
}

export interface PartnerCreateTourRequestCancellationInput
	extends PartnerTourActionBaseInput {
	reason?: string | null;
	message?: string | null;
}

export interface PartnerListFacilityReviewsInput
	extends PartnerFacilityInput,
		OffsetPageInput {
	statuses?: PartnerReviewStatus[];
}

export interface PartnerCreateFacilityReviewResponseInput
	extends PartnerFacilityInput {
	review_id: string;
	body: string;
}

export interface PartnerUpdateFacilityReviewResponseInput
	extends PartnerFacilityInput {
	review_id: string;
	body: string;
	expected_version?: number;
}

export interface PartnerCreateReviewFlagInput extends PartnerFacilityInput {
	review_id: string;
	reason: ReviewFlagReason;
	details?: string | null;
}

export interface PartnerOffsetPage {
	type: "offset";
	limit: number;
	offset: number;
	has_more: boolean;
	total_count: number;
}

export interface PartnerListTourRequestsResult {
	data: PartnerTourRequestSummary[];
	page: PartnerOffsetPage;
}

export interface PartnerListReviewsResult {
	data: PartnerReviewSummary[];
	page: PartnerOffsetPage;
}

export interface PartnerReviewFlagSummary {
	id: string;
	review_id: string;
	facility_id: string;
	reason: ReviewFlagReason;
	details: string | null;
	status: ReviewFlagRow["status"];
	created_at: string;
	updated_at: string;
}

interface TourActionConfig<TInput extends PartnerTourActionBaseInput> {
	operation: string;
	auditAction: string;
	eventType: string;
	nextStatus: PartnerTourStatus;
	input: TInput;
	details: (input: TInput) => Record<string, unknown>;
	statusFields?: (
		input: TInput,
	) => {
		scheduledDate?: string;
		scheduledTime?: string;
		partnerMessage?: string | null;
	};
}

/**
 * Route handlers must copy the incoming Idempotency-Key header into
 * ctx.idempotencyKey before invoking duplicate-prone workflow mutations.
 */
export class PartnerWorkflowService {
	private readonly audit: AuditWriter;
	private readonly outbox: OutboxWriter;
	private readonly idempotency: IdempotencyService;
	private readonly transactionRunner: TransactionRunner;

	constructor(
		private readonly repos: Repositories,
		transactionRunner?: TransactionRunner,
	) {
		this.audit = new AuditWriter(repos.audit);
		this.outbox = new OutboxWriter(repos.outbox);
		this.idempotency = new IdempotencyService(repos.idempotency);
		this.transactionRunner = transactionRunner ?? new TransactionRunner();
	}

	async listFacilityTourRequests(
		ctx: RequestContext,
		input: PartnerListFacilityTourRequestsInput,
	): Promise<PartnerListTourRequestsResult> {
		const scope = await requirePartnerFacilityScope(
			ctx,
			this.repos.partnerFacilities,
			input.facility_id,
		);
		const result = await this.repos.tours.listForFacility({
			facilityId: scope.facility_id,
			statuses: input.statuses,
			limit: input.limit,
			offset: input.offset,
		});

		return {
			data: result.rows.map(toPartnerTourRequestSummary),
			page: toOffsetPage(input, result),
		};
	}

	createTourRequestConfirmation(
		ctx: RequestContext,
		input: PartnerCreateTourRequestConfirmationInput,
	): Promise<PartnerTourRequestSummary> {
		return this.applyTourAction(ctx, {
			operation: "partner_create_tour_request_confirmation",
			auditAction: "partner_confirm_tour_request",
			eventType: "tour_request.confirmed",
			nextStatus: "confirmed",
			input,
			details: ({ scheduled_date, scheduled_time, message }) => ({
				scheduled_date,
				scheduled_time,
				message,
			}),
			statusFields: ({ scheduled_date, scheduled_time, message }) => ({
				scheduledDate: scheduled_date,
				scheduledTime: scheduled_time,
				partnerMessage: message ?? null,
			}),
		});
	}

	createTourRequestDecline(
		ctx: RequestContext,
		input: PartnerCreateTourRequestDeclineInput,
	): Promise<PartnerTourRequestSummary> {
		return this.applyTourAction(ctx, {
			operation: "partner_create_tour_request_decline",
			auditAction: "partner_decline_tour_request",
			eventType: "tour_request.declined",
			nextStatus: "declined",
			input,
			details: ({ reason, message }) => ({ reason, message }),
		});
	}

	createTourRequestAttendance(
		ctx: RequestContext,
		input: PartnerCreateTourRequestAttendanceInput,
	): Promise<PartnerTourRequestSummary> {
		return this.applyTourAction(ctx, {
			operation: "partner_create_tour_request_attendance",
			auditAction: "partner_mark_tour_request_attended",
			eventType: "tour_request.attended",
			nextStatus: "attended",
			input,
			details: ({ attended_at, note }) => ({ attended_at, note }),
		});
	}

	createTourRequestNoShow(
		ctx: RequestContext,
		input: PartnerCreateTourRequestNoShowInput,
	): Promise<PartnerTourRequestSummary> {
		return this.applyTourAction(ctx, {
			operation: "partner_create_tour_request_no_show",
			auditAction: "partner_mark_tour_request_no_show",
			eventType: "tour_request.no_show",
			nextStatus: "no_show",
			input,
			details: ({ note }) => ({ note }),
		});
	}

	createTourRequestCancellation(
		ctx: RequestContext,
		input: PartnerCreateTourRequestCancellationInput,
	): Promise<PartnerTourRequestSummary> {
		return this.applyTourAction(ctx, {
			operation: "partner_create_tour_request_cancellation",
			auditAction: "partner_cancel_tour_request",
			eventType: "tour_request.cancelled",
			nextStatus: "cancelled",
			input,
			details: ({ reason, message }) => ({ reason, message }),
		});
	}

	async listFacilityReviews(
		ctx: RequestContext,
		input: PartnerListFacilityReviewsInput,
	): Promise<PartnerListReviewsResult> {
		const scope = await requirePartnerFacilityScope(
			ctx,
			this.repos.partnerFacilities,
			input.facility_id,
		);
		const result = await this.repos.reviews.listForFacilityForPartner({
			facilityId: scope.facility_id,
			statuses: input.statuses,
			limit: input.limit,
			offset: input.offset,
		});
		const reviewSummaries = await this.toReviewSummaries(
			result.rows,
			scope.actor_user_id,
		);

		return {
			data: reviewSummaries,
			page: toOffsetPage(input, result),
		};
	}

	async createFacilityReviewResponse(
		ctx: RequestContext,
		input: PartnerCreateFacilityReviewResponseInput,
	): Promise<PartnerReviewSummary> {
		const scope = await requirePartnerFacilityScope(
			ctx,
			this.repos.partnerFacilities,
			input.facility_id,
		);

		return (
			await this.idempotency.run({
				key: ctx.idempotencyKey ?? null,
				userId: scope.actor_user_id,
				requestBody: {
					operation: "partner_create_facility_review_response",
					...input,
				},
				now: ctx.now,
				execute: async () => {
					const review = await this.requireFacilityReview(
						scope.facility_id,
						input.review_id,
					);

					return this.transactionRunner.run(async () => {
						const response = await this.repos.reviews.createResponse({
							facilityId: scope.facility_id,
							reviewId: input.review_id,
							responderUserId: scope.actor_user_id,
							body: input.body,
							now: ctx.now,
						});
						const summary = await this.toReviewSummary(
							review,
							scope.actor_user_id,
						);

						await this.audit.write(ctx, {
							action: "partner_create_review_response",
							resourceType: "review_response",
							resourceId: response.id,
							metadata: {
								facility_id: scope.facility_id,
								review_id: review.id,
							},
						});
						await this.outbox.write({
							eventType: "review_response.created",
							aggregateType: "review_response",
							aggregateId: response.id,
							payload: {
								review_response_id: response.id,
								review_id: review.id,
								facility_id: scope.facility_id,
								actor_user_id: scope.actor_user_id,
							},
							createdAt: ctx.now,
						});

						return {
							...summary,
							response: toPartnerReviewSummary({
								review,
								response,
								pendingFlags:
									await this.repos.reviews.listPendingFlagsForReviews([
										review.id,
									]),
								currentUserId: scope.actor_user_id,
							}).response,
						};
					});
				},
			})
		).result;
	}

	async updateFacilityReviewResponse(
		ctx: RequestContext,
		input: PartnerUpdateFacilityReviewResponseInput,
	): Promise<PartnerReviewSummary> {
		const scope = await requirePartnerFacilityScope(
			ctx,
			this.repos.partnerFacilities,
			input.facility_id,
		);

		return (
			await this.idempotency.run({
				key: ctx.idempotencyKey ?? null,
				userId: scope.actor_user_id,
				requestBody: {
					operation: "partner_update_facility_review_response",
					...input,
				},
				now: ctx.now,
				execute: async () => {
					const review = await this.requireFacilityReview(
						scope.facility_id,
						input.review_id,
					);
					const before = await this.repos.reviews.findResponseForReview(
						review.id,
					);
					const beforeSnapshot = before
						? {
								version: before.version,
								status: before.status,
								body: before.body,
							}
						: undefined;

					return this.transactionRunner.run(async () => {
						const response = await this.repos.reviews.updateResponse({
							facilityId: scope.facility_id,
							reviewId: input.review_id,
							responderUserId: scope.actor_user_id,
							body: input.body,
							expectedVersion: input.expected_version,
							now: ctx.now,
						});
						const summary = await this.toReviewSummary(
							review,
							scope.actor_user_id,
						);

						await this.audit.write(ctx, {
							action: "partner_update_review_response",
							resourceType: "review_response",
							resourceId: response.id,
							before: beforeSnapshot
								? {
										version: beforeSnapshot.version,
										status: beforeSnapshot.status,
									}
								: undefined,
							after: {
								version: response.version,
								status: response.status,
							},
							diff: {
								body_changed: beforeSnapshot?.body !== response.body,
							},
							metadata: {
								facility_id: scope.facility_id,
								review_id: review.id,
							},
						});
						await this.outbox.write({
							eventType: "review_response.updated",
							aggregateType: "review_response",
							aggregateId: response.id,
							payload: {
								review_response_id: response.id,
								review_id: review.id,
								facility_id: scope.facility_id,
								actor_user_id: scope.actor_user_id,
							},
							createdAt: ctx.now,
						});

						return {
							...summary,
							response: toPartnerReviewSummary({
								review,
								response,
								pendingFlags:
									await this.repos.reviews.listPendingFlagsForReviews([
										review.id,
									]),
								currentUserId: scope.actor_user_id,
							}).response,
						};
					});
				},
			})
		).result;
	}

	async createReviewFlag(
		ctx: RequestContext,
		input: PartnerCreateReviewFlagInput,
	): Promise<PartnerReviewFlagSummary> {
		const scope = await requirePartnerFacilityScope(
			ctx,
			this.repos.partnerFacilities,
			input.facility_id,
		);

		return (
			await this.idempotency.run({
				key: ctx.idempotencyKey ?? null,
				userId: scope.actor_user_id,
				requestBody: {
					operation: "partner_create_review_flag",
					...input,
				},
				now: ctx.now,
				execute: async () => {
					const review = await this.requireFacilityReview(
						scope.facility_id,
						input.review_id,
					);

					return this.transactionRunner.run(async () => {
						const flag = await this.repos.reviews.createFlag({
							facilityId: scope.facility_id,
							reviewId: input.review_id,
							flaggedByUserId: scope.actor_user_id,
							reason: input.reason,
							details: input.details ?? null,
							now: ctx.now,
						});

						await this.audit.write(ctx, {
							action: "partner_create_review_flag",
							resourceType: "review_flag",
							resourceId: flag.id,
							metadata: {
								facility_id: scope.facility_id,
								review_id: review.id,
								reason: flag.reason,
							},
						});
						await this.outbox.write({
							eventType: "review_flag.created",
							aggregateType: "review_flag",
							aggregateId: flag.id,
							payload: {
								review_flag_id: flag.id,
								review_id: review.id,
								facility_id: scope.facility_id,
								actor_user_id: scope.actor_user_id,
								reason: flag.reason,
							},
							createdAt: ctx.now,
						});

						return toPartnerReviewFlagSummary(flag);
					});
				},
			})
		).result;
	}

	private async applyTourAction<TInput extends PartnerTourActionBaseInput>(
		ctx: RequestContext,
		config: TourActionConfig<TInput>,
	): Promise<PartnerTourRequestSummary> {
		const scope = await requirePartnerFacilityScope(
			ctx,
			this.repos.partnerFacilities,
			config.input.facility_id,
		);

		return (
			await this.idempotency.run({
				key: ctx.idempotencyKey ?? null,
				userId: scope.actor_user_id,
				requestBody: {
					operation: config.operation,
					...config.input,
				},
				now: ctx.now,
				execute: async () => {
					const current = await this.repos.tours.findForFacility({
						facilityId: scope.facility_id,
						tourRequestId: config.input.tour_request_id,
					});
					if (!current) {
						throw new ApiError(
							"not_found",
							"Tour request was not found.",
							404,
							{
								facilityId: scope.facility_id,
								tourRequestId: config.input.tour_request_id,
							},
						);
					}

					assertTourTransitionAllowed(current.status, config.nextStatus);
					const previousStatus = current.status;
					const previousVersion = current.version;
					const details = removeUndefined(config.details(config.input));
					const statusFields = config.statusFields?.(config.input);

					const updated = await this.transactionRunner.run(async () => {
						const row = await this.repos.tours.updateStatus({
							facilityId: scope.facility_id,
							tourRequestId: current.id,
							status: config.nextStatus,
							expectedVersion: config.input.expected_version,
							updatedAt: ctx.now,
							...statusFields,
						});

						await this.audit.write(ctx, {
							action: config.auditAction,
							resourceType: "tour_request",
							resourceId: row.id,
							before: { status: previousStatus, version: previousVersion },
							after: { status: row.status, version: row.version },
							metadata: {
								facility_id: scope.facility_id,
								previous_status: previousStatus,
								new_status: row.status,
								details,
							},
						});
						await this.outbox.write({
							eventType: config.eventType,
							aggregateType: "tour_request",
							aggregateId: row.id,
							payload: {
								tour_request_id: row.id,
								facility_id: scope.facility_id,
								family_user_id: row.user_id,
								actor_user_id: scope.actor_user_id,
								previous_status: previousStatus,
								new_status: row.status,
								details,
							},
							createdAt: ctx.now,
						});

						return row;
					});

					return toPartnerTourRequestSummary(updated);
				},
			})
		).result;
	}

	private async requireFacilityReview(facilityId: string, reviewId: string) {
		const review = await this.repos.reviews.findForFacility({
			facilityId,
			reviewId,
		});
		if (!review) {
			throw new ApiError("not_found", "Review was not found.", 404, {
				facilityId,
				reviewId,
			});
		}
		return review;
	}

	private async toReviewSummaries(
		reviews: ReviewRow[],
		currentUserId: string,
	): Promise<PartnerReviewSummary[]> {
		const reviewIds = reviews.map((review) => review.id);
		const [responses, flags] = await Promise.all([
			this.repos.reviews.listResponsesForReviews(reviewIds),
			this.repos.reviews.listPendingFlagsForReviews(reviewIds),
		]);
		const responsesByReviewId = new Map(
			responses.map((response) => [response.review_id, response]),
		);
		const flagsByReviewId = groupFlagsByReviewId(flags);

		return reviews.map((review) =>
			toPartnerReviewSummary({
				review,
				response: responsesByReviewId.get(review.id),
				pendingFlags: flagsByReviewId.get(review.id) ?? [],
				currentUserId,
			}),
		);
	}

	private async toReviewSummary(
		review: ReviewRow,
		currentUserId: string,
	): Promise<PartnerReviewSummary> {
		const [summary] = await this.toReviewSummaries([review], currentUserId);
		if (!summary) {
			throw new ApiError("not_found", "Review was not found.", 404, {
				reviewId: review.id,
			});
		}
		return summary;
	}
}

function toOffsetPage(
	input: OffsetPageInput,
	result: { total: number; hasMore: boolean },
): PartnerOffsetPage {
	return {
		type: "offset",
		limit: input.limit,
		offset: input.offset,
		has_more: result.hasMore,
		total_count: result.total,
	};
}

function toPartnerReviewFlagSummary(
	flag: ReviewFlagRow,
): PartnerReviewFlagSummary {
	return {
		id: flag.id,
		review_id: flag.review_id,
		facility_id: flag.facility_id,
		reason: flag.reason,
		details: flag.details,
		status: flag.status,
		created_at: toIsoString(flag.created_at),
		updated_at: toIsoString(flag.updated_at),
	};
}

function groupFlagsByReviewId(flags: ReviewFlagRow[]) {
	const byReviewId = new Map<string, ReviewFlagRow[]>();
	for (const flag of flags) {
		const existing = byReviewId.get(flag.review_id) ?? [];
		existing.push(flag);
		byReviewId.set(flag.review_id, existing);
	}
	return byReviewId;
}

function removeUndefined(
	input: Record<string, unknown>,
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(input).filter(([, value]) => value !== undefined),
	);
}

function toIsoString(value: Date | string): string {
	return value instanceof Date
		? value.toISOString()
		: new Date(value).toISOString();
}
