import {
	toPartnerAuditEventSummary,
	toPartnerFacilityAvailability,
	toPartnerFacilitySummary,
	toPartnerListingEditableFields,
	toPartnerListingLockedFields,
	toPartnerPermissions,
	toPartnerTourAvailability,
	toPartnerTourRequestSummary,
	type PartnerAuditEventSummary,
	type PartnerFacilityAvailability,
	type PartnerFacilitySummary,
	type PartnerListingEditableFields,
	type PartnerListingLockedFields,
	type PartnerPermissions,
	type PartnerTourAvailability,
	type PartnerTourRequestSummary,
} from "@/db/projections/partnerFacilityProjection";
import type {
	PartnerTourSummary,
	Repositories,
} from "@/db/repositories/ports";
import type { ReviewRow, TourRequestRow } from "@/db/schema/types";
import type { RequestContext } from "@/shared/request-context/context";
import { requirePartnerFacilityScope } from "./partnerFacilityScope";

const DASHBOARD_RECENT_LIMIT = 5;
const ANALYTICS_PAGE_LIMIT = 200;

export interface PartnerDashboardPageInput {
	limit: number;
	offset: number;
}

export interface PartnerDashboardPage {
	type: "offset";
	limit: number;
	offset: number;
	has_more: boolean;
	total_count: number;
}

export interface PartnerFacilityManagerDashboard {
	facility: PartnerFacilitySummary;
	permissions: PartnerPermissions;
	editable_fields: PartnerListingEditableFields;
	locked_fields: PartnerListingLockedFields;
	availability: PartnerFacilityAvailability;
	tour_availability: PartnerTourAvailability;
	tour_summary: PartnerTourSummary;
	recent_tour_requests: PartnerTourRequestSummary[];
	recent_edits: PartnerAuditEventSummary[];
	reference_data: PartnerReferenceData;
}

export interface PartnerReferenceData {
	features: Array<{ id: string; name: string }>;
	languages: Array<{ id: string; name: string }>;
}

export interface PartnerFacilityAnalyticsInput {
	facility_id: string;
	from?: string;
	to?: string;
}

export interface PartnerFacilityAnalytics {
	facility_id: string;
	period: {
		from: string | null;
		to: string | null;
	};
	metrics: {
		review_count: number;
		average_rating: number;
		pending_tour_requests: number;
		confirmed_tour_requests: number;
	};
}

export interface PartnerListFacilityAuditEventsInput
	extends PartnerDashboardPageInput {
	facility_id: string;
	actions?: string[];
}

export class PartnerDashboardService {
	constructor(private readonly repos: Repositories) {}

	async getFacilityManagerDashboard(
		ctx: RequestContext,
		input: { facility_id: string },
	): Promise<PartnerFacilityManagerDashboard> {
		const scope = await requirePartnerFacilityScope(
			ctx,
			this.repos.partnerFacilities,
			input.facility_id,
		);

		const [tourSummary, recentTours, recentEdits, referenceOptions] =
			await Promise.all([
				this.repos.tours.summarizeForFacility(scope.facility_id),
				this.repos.tours.listForFacility({
					facilityId: scope.facility_id,
					limit: DASHBOARD_RECENT_LIMIT,
					offset: 0,
				}),
				this.repos.audit.listForResource({
					resourceType: "facility",
					resourceId: scope.facility_id,
					limit: DASHBOARD_RECENT_LIMIT,
					offset: 0,
				}),
				this.repos.references.getSearchOptions(),
			]);

		return {
			facility: toPartnerFacilitySummary(scope.facility),
			permissions: toPartnerPermissions(),
			editable_fields: toPartnerListingEditableFields(scope.facility),
			locked_fields: toPartnerListingLockedFields(scope.facility),
			availability: toPartnerFacilityAvailability(scope.facility),
			tour_availability: toPartnerTourAvailability(scope.facility),
			tour_summary: tourSummary,
			recent_tour_requests: recentTours.rows.map(toPartnerTourRequestSummary),
			recent_edits: recentEdits.rows.map(toPartnerAuditEventSummary),
			reference_data: {
				features: referenceOptions.features,
				languages: referenceOptions.languages,
			},
		};
	}

	async getFacilityAnalytics(
		ctx: RequestContext,
		input: PartnerFacilityAnalyticsInput,
	): Promise<PartnerFacilityAnalytics> {
		const scope = await requirePartnerFacilityScope(
			ctx,
			this.repos.partnerFacilities,
			input.facility_id,
		);
		const period = {
			from: input.from ?? null,
			to: input.to ?? null,
		};

		const [reviews, tours] = await Promise.all([
			this.listAllReviews(scope.facility_id),
			this.listAllTours(scope.facility_id, ["pending_review", "confirmed"]),
		]);
		const periodReviews = reviews.filter((review) =>
			isWithinPeriod(review.review_date, period.from, period.to),
		);
		const periodTours = tours.filter((tour) =>
			isWithinPeriod(tour.created_at, period.from, period.to),
		);

		return {
			facility_id: scope.facility_id,
			period,
			metrics: {
				review_count: periodReviews.length,
				average_rating: averageRating(periodReviews),
				pending_tour_requests: periodTours.filter(
					(tour) => tour.status === "pending_review",
				).length,
				confirmed_tour_requests: periodTours.filter(
					(tour) => tour.status === "confirmed",
				).length,
			},
		};
	}

	async listFacilityAuditEvents(
		ctx: RequestContext,
		input: PartnerListFacilityAuditEventsInput,
	): Promise<{ data: PartnerAuditEventSummary[]; page: PartnerDashboardPage }> {
		const scope = await requirePartnerFacilityScope(
			ctx,
			this.repos.partnerFacilities,
			input.facility_id,
		);
		const result = await this.repos.audit.listForResource({
			resourceType: "facility",
			resourceId: scope.facility_id,
			actions: input.actions,
			limit: input.limit,
			offset: input.offset,
		});

		return {
			data: result.rows.map(toPartnerAuditEventSummary),
			page: {
				type: "offset",
				limit: input.limit,
				offset: input.offset,
				has_more: result.hasMore,
				total_count: result.total,
			},
		};
	}

	private async listAllReviews(facilityId: string): Promise<ReviewRow[]> {
		const rows: ReviewRow[] = [];
		let offset = 0;
		let hasMore = true;

		while (hasMore) {
			const page = await this.repos.reviews.listForFacilityForPartner({
				facilityId,
				statuses: ["published"],
				limit: ANALYTICS_PAGE_LIMIT,
				offset,
			});
			rows.push(...page.rows);
			hasMore = page.hasMore;
			offset += page.rows.length;
		}

		return rows;
	}

	private async listAllTours(
		facilityId: string,
		statuses: TourRequestRow["status"][],
	): Promise<TourRequestRow[]> {
		const rows: TourRequestRow[] = [];
		let offset = 0;
		let hasMore = true;

		while (hasMore) {
			const page = await this.repos.tours.listForFacility({
				facilityId,
				statuses,
				limit: ANALYTICS_PAGE_LIMIT,
				offset,
			});
			rows.push(...page.rows);
			hasMore = page.hasMore;
			offset += page.rows.length;
		}

		return rows;
	}
}

function averageRating(reviews: ReviewRow[]): number {
	if (reviews.length === 0) return 0;
	const total = reviews.reduce((sum, review) => sum + review.rating, 0);
	return Number((total / reviews.length).toFixed(2));
}

function isWithinPeriod(
	value: Date | string,
	from: string | null,
	to: string | null,
): boolean {
	const timestamp = new Date(value).getTime();
	if (from !== null && timestamp < new Date(from).getTime()) return false;
	if (to !== null && timestamp > new Date(to).getTime()) return false;
	return true;
}
