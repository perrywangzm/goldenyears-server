import type { PartnerTourSummary } from "@/db/repositories/ports";
import type {
	AuditEventRow,
	FacilityRow,
	ReviewFlagRow,
	ReviewResponseRow,
	ReviewRow,
	TourRequestRow,
} from "@/db/schema/types";

export interface PartnerManagedFacilitySummary {
	id: string;
	company_id: string;
	slug: string;
	name: string;
	status: FacilityRow["status"];
	is_enabled: boolean;
	availability_status: FacilityRow["availability_status"];
	beds_available: number | null;
	availability_updated_at: string | null;
	version: number;
	updated_at: string;
}

export interface PartnerFacilitySummary extends PartnerManagedFacilitySummary {
	tagline: string;
	image_url: string;
	care_types: string[];
	region_id: string;
	district: string;
	rating: number;
	review_count: number;
}

export interface PartnerListingEditableFields {
	tagline: string;
	about: string;
	highlights: string[];
	right_for_you_if: string[];
	features: string[];
	languages: string[];
}

export interface PartnerListingLockedFields {
	name: string;
	licence: string | null;
	year_opened: number | null;
	capacity: number | null;
	address: string;
	postal_code: string;
	district: string;
	region_id: string;
	care_types: string[];
	price_from: number;
	price_unit: FacilityRow["price_unit"];
	rating: number;
	review_count: number;
	status: FacilityRow["status"];
	is_enabled: boolean;
	slug: string;
}

export interface PartnerFacilityAvailability {
	status: FacilityRow["availability_status"];
	beds_available: number | null;
	note: string | null;
	updated_at: string | null;
}

export interface PartnerTourAvailabilityWindow {
	day_of_week: number;
	start_time: string;
	end_time: string;
}

export interface PartnerTourAvailabilityException {
	date: string;
	status: "available" | "limited" | "unavailable";
	windows?: PartnerTourAvailabilityWindow[];
	note?: string | null;
}

export interface PartnerTourAvailability {
	status: "available" | "limited" | "unavailable";
	timezone: "Asia/Singapore";
	weekly_windows: PartnerTourAvailabilityWindow[];
	exceptions: PartnerTourAvailabilityException[];
	notes: string | null;
	updated_at: string | null;
}

export interface PartnerPermissions {
	can_edit_listing: boolean;
	can_update_availability: boolean;
	can_update_tour_availability: boolean;
	can_manage_tours: boolean;
	can_respond_to_reviews: boolean;
	can_flag_reviews: boolean;
}

export interface PartnerTourRequestSummary {
	id: string;
	facility_id: string;
	status: TourRequestRow["status"];
	contact_name: string;
	contact_phone: string;
	contact_email: string;
	preferred_date: string;
	preferred_time: string;
	care_notes: string | null;
	scheduled_date: string | null;
	scheduled_time: string | null;
	partner_message: string | null;
	version: number;
	created_at: string;
	updated_at: string;
}

export interface PartnerReviewResponseSummary {
	id: string;
	review_id: string;
	facility_id: string;
	body: string;
	status: ReviewResponseRow["status"];
	version: number;
	created_at: string;
	updated_at: string;
}

export interface PartnerReviewSummary {
	id: string;
	facility_id: string;
	author_name: string;
	relationship: string;
	rating: number;
	title: string;
	body: string;
	review_date: string;
	verified: boolean;
	status: ReviewRow["status"];
	version: number;
	response: PartnerReviewResponseSummary | null;
	flags: {
		pending_count: number;
		current_user_pending: boolean;
	};
}

export interface PartnerAuditEventSummary {
	id: string;
	action: string;
	resource_type: string;
	resource_id: string;
	metadata: unknown;
	created_at: string;
}

export function toPartnerManagedFacilitySummary(
	facility: FacilityRow,
): PartnerManagedFacilitySummary {
	return {
		id: facility.id,
		company_id: facility.company_id ?? "",
		slug: facility.slug,
		name: facility.name,
		status: facility.status,
		is_enabled: facility.is_enabled,
		availability_status: facility.availability_status,
		beds_available: facility.beds_available,
		availability_updated_at: toIsoStringOrNull(
			facility.availability_updated_at,
		),
		version: facility.version,
		updated_at: toIsoString(facility.updated_at),
	};
}

export function toPartnerFacilitySummary(
	facility: FacilityRow,
): PartnerFacilitySummary {
	return {
		...toPartnerManagedFacilitySummary(facility),
		tagline: facility.tagline,
		image_url: facility.image_url,
		care_types: facility.care_types,
		region_id: facility.region_id,
		district: facility.district,
		rating: Number(facility.rating),
		review_count: facility.review_count,
	};
}

export function toPartnerListingEditableFields(
	facility: FacilityRow,
): PartnerListingEditableFields {
	return {
		tagline: facility.tagline,
		about: facility.about,
		highlights: facility.highlights,
		right_for_you_if: facility.right_for_you_if,
		features: facility.features,
		languages: facility.languages,
	};
}

export function toPartnerListingLockedFields(
	facility: FacilityRow,
): PartnerListingLockedFields {
	return {
		name: facility.name,
		licence: facility.licence,
		year_opened: facility.year_opened,
		capacity: facility.capacity,
		address: facility.address,
		postal_code: facility.postal_code,
		district: facility.district,
		region_id: facility.region_id,
		care_types: facility.care_types,
		price_from: facility.price_from,
		price_unit: facility.price_unit,
		rating: Number(facility.rating),
		review_count: facility.review_count,
		status: facility.status,
		is_enabled: facility.is_enabled,
		slug: facility.slug,
	};
}

export function toPartnerFacilityAvailability(
	facility: FacilityRow,
): PartnerFacilityAvailability {
	return {
		status: facility.availability_status,
		beds_available: facility.beds_available,
		note: facility.availability_note,
		updated_at: toIsoStringOrNull(facility.availability_updated_at),
	};
}

export function toPartnerTourAvailability(
	facility: FacilityRow,
): PartnerTourAvailability {
	const value = asRecord(facility.tour_availability);
	return {
		status: toTourAvailabilityStatus(value.status),
		timezone: "Asia/Singapore",
		weekly_windows: toTourAvailabilityWindows(value.weekly_windows),
		exceptions: toTourAvailabilityExceptions(value.exceptions),
		notes: typeof value.notes === "string" ? value.notes : null,
		updated_at: toIsoStringOrNull(facility.tour_availability_updated_at),
	};
}

export function toPartnerPermissions(): PartnerPermissions {
	return {
		can_edit_listing: true,
		can_update_availability: true,
		can_update_tour_availability: true,
		can_manage_tours: true,
		can_respond_to_reviews: true,
		can_flag_reviews: true,
	};
}

export function emptyPartnerTourSummary(): PartnerTourSummary {
	return {
		pending_review: 0,
		confirmed: 0,
		attended: 0,
		no_show: 0,
		declined: 0,
		cancelled: 0,
	};
}

export function toPartnerTourRequestSummary(
	tour: TourRequestRow,
): PartnerTourRequestSummary {
	return {
		id: tour.id,
		facility_id: tour.facility_id,
		status: tour.status,
		contact_name: tour.contact_name,
		contact_phone: tour.contact_phone,
		contact_email: tour.contact_email,
		preferred_date: tour.preferred_date,
		preferred_time: tour.preferred_time,
		care_notes: tour.care_notes,
		...(tour.scheduled_date != null
			? { scheduled_date: tour.scheduled_date }
			: {}),
		...(tour.scheduled_time != null
			? { scheduled_time: tour.scheduled_time }
			: {}),
		...(tour.partner_message != null
			? { partner_message: tour.partner_message }
			: {}),
		version: tour.version,
		created_at: toIsoString(tour.created_at),
		updated_at: toIsoString(tour.updated_at),
	};
}

export function toPartnerReviewResponseSummary(
	response: ReviewResponseRow,
): PartnerReviewResponseSummary {
	return {
		id: response.id,
		review_id: response.review_id,
		facility_id: response.facility_id,
		body: response.body,
		status: response.status,
		version: response.version,
		created_at: toIsoString(response.created_at),
		updated_at: toIsoString(response.updated_at),
	};
}

export function toPartnerReviewSummary(input: {
	review: ReviewRow;
	response?: ReviewResponseRow;
	pendingFlags: ReviewFlagRow[];
	currentUserId: string;
}): PartnerReviewSummary {
	return {
		id: input.review.id,
		facility_id: input.review.facility_id,
		author_name: input.review.author_name,
		relationship: input.review.relationship,
		rating: input.review.rating,
		title: input.review.title,
		body: input.review.body,
		review_date: input.review.review_date,
		verified: input.review.verified,
		status: input.review.status,
		version: input.review.version,
		response: input.response
			? toPartnerReviewResponseSummary(input.response)
			: null,
		flags: {
			pending_count: input.pendingFlags.length,
			current_user_pending: input.pendingFlags.some(
				(flag) => flag.flagged_by_user_id === input.currentUserId,
			),
		},
	};
}

export function toPartnerAuditEventSummary(
	event: AuditEventRow,
): PartnerAuditEventSummary {
	return {
		id: event.id,
		action: event.action,
		resource_type: event.resource_type,
		resource_id: event.resource_id,
		metadata: event.metadata,
		created_at: toIsoString(event.created_at),
	};
}

function toIsoString(value: Date | string): string {
	return value instanceof Date
		? value.toISOString()
		: new Date(value).toISOString();
}

function toIsoStringOrNull(value: Date | string | null): string | null {
	return value === null ? null : toIsoString(value);
}

function asRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function toTourAvailabilityStatus(
	value: unknown,
): PartnerTourAvailability["status"] {
	return value === "limited" || value === "unavailable" ? value : "available";
}

function toTourAvailabilityWindows(
	value: unknown,
): PartnerTourAvailabilityWindow[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item) => {
		const window = asRecord(item);
		if (
			typeof window.day_of_week !== "number" ||
			typeof window.start_time !== "string" ||
			typeof window.end_time !== "string"
		) {
			return [];
		}
		return [
			{
				day_of_week: window.day_of_week,
				start_time: window.start_time,
				end_time: window.end_time,
			},
		];
	});
}

function toTourAvailabilityExceptions(
	value: unknown,
): PartnerTourAvailabilityException[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item) => {
		const exception = asRecord(item);
		if (typeof exception.date !== "string") return [];
		return [
			{
				date: exception.date,
				status: toTourAvailabilityStatus(exception.status),
				windows: toTourAvailabilityWindows(exception.windows),
				note: typeof exception.note === "string" ? exception.note : null,
			},
		];
	});
}
