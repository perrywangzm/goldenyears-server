import { z } from "@hono/zod-openapi";
import { OffsetPageRequestSchema } from "@/shared/pagination/page.schema";

export const PartnerLoginRequestSchema = z
	.object({ email: z.email(), password: z.string().min(1) })
	.strict()
	.openapi("PartnerLoginRequest");

export const SafeUserSchema = z
	.object({ id: z.string(), email: z.string(), display_name: z.string() })
	.strict()
	.openapi("PartnerSafeUser");

export const PartnerLoginResponseSchema = z
	.object({
		session: z
			.object({
				id: z.string(),
				audience: z.literal("partner"),
				expires_at: z.string(),
			})
			.strict(),
		user: SafeUserSchema,
		roles: z.array(z.string()),
		csrf_token: z.string(),
	})
	.strict()
	.openapi("PartnerLoginResponseData");

export const PartnerMeSchema = z
	.object({
		user: SafeUserSchema,
		companies: z.array(
			z
				.object({
					id: z.string(),
					name: z.string(),
					status: z.literal("active"),
				})
				.strict(),
		),
		managed_facility_count: z.number().int().nonnegative(),
		csrf: z
			.object({
				cookie_name: z.literal("gy_partner_session_csrf"),
				header_name: z.literal("X-CSRF-Token"),
				token: z.string().nullable(),
			})
			.strict(),
	})
	.strict()
	.openapi("PartnerMeData");

export const PartnerAvailabilityStatusSchema = z.enum([
	"available",
	"limited",
	"waitlist",
	"unavailable",
	"full",
]);

export const ManagedFacilitySchema = z
	.object({
		id: z.string(),
		company_id: z.string(),
		slug: z.string(),
		name: z.string(),
		status: z.enum(["draft", "approved", "rejected", "disabled", "removed"]),
		is_enabled: z.boolean(),
		availability_status: PartnerAvailabilityStatusSchema,
		beds_available: z.number().int().nullable(),
		availability_updated_at: z.string().nullable(),
		version: z.number().int(),
		updated_at: z.string(),
	})
	.strict()
	.openapi("PartnerManagedFacility");

export const ListManagedFacilitiesRequestSchema = z
	.object({ page: OffsetPageRequestSchema.optional() })
	.strict()
	.openapi("PartnerListManagedFacilitiesRequest");

export const PartnerFacilityIdRequestSchema = z
	.object({ facility_id: z.string().min(1) })
	.strict()
	.openapi("PartnerFacilityIdRequest");

export const PartnerGetFacilityManagerDashboardRequestSchema =
	PartnerFacilityIdRequestSchema.openapi(
		"PartnerGetFacilityManagerDashboardRequest",
	);

export const PartnerListFacilityTourRequestsRequestSchema =
	PartnerFacilityIdRequestSchema.extend({
		statuses: z
			.array(
				z.enum([
					"pending_review",
					"confirmed",
					"declined",
					"attended",
					"no_show",
					"cancelled",
				]),
			)
			.optional(),
		page: OffsetPageRequestSchema.optional(),
	})
		.strict()
		.openapi("PartnerListFacilityTourRequestsRequest");

export const PartnerListFacilityReviewsRequestSchema =
	PartnerFacilityIdRequestSchema.extend({
		statuses: z.array(z.enum(["published", "hidden"])).optional(),
		page: OffsetPageRequestSchema.optional(),
	})
		.strict()
		.openapi("PartnerListFacilityReviewsRequest");

export const PartnerGetFacilityAnalyticsRequestSchema =
	PartnerFacilityIdRequestSchema.extend({
		from: z.string().optional(),
		to: z.string().optional(),
	})
		.strict()
		.openapi("PartnerGetFacilityAnalyticsRequest");

export const PartnerListFacilityAuditEventsRequestSchema =
	PartnerFacilityIdRequestSchema.extend({
		actions: z.array(z.string().min(1)).optional(),
		page: OffsetPageRequestSchema.optional(),
	})
		.strict()
		.openapi("PartnerListFacilityAuditEventsRequest");

export const PartnerFacilityAvailabilitySchema = z
	.object({
		status: PartnerAvailabilityStatusSchema,
		beds_available: z.number().int().nonnegative().nullable(),
		note: z.string().max(1000).nullable(),
		updated_at: z.string().nullable(),
	})
	.strict()
	.openapi("PartnerFacilityAvailability");

export const PartnerTourAvailabilityWindowSchema = z
	.object({
		day_of_week: z.number().int().min(0).max(6),
		start_time: z.string().min(1),
		end_time: z.string().min(1),
	})
	.strict()
	.openapi("PartnerTourAvailabilityWindow");

export const PartnerTourAvailabilityExceptionSchema = z
	.object({
		date: z.string().min(1),
		status: z.enum(["available", "limited", "unavailable"]),
		windows: z.array(PartnerTourAvailabilityWindowSchema).optional(),
		note: z.string().max(1000).nullable().optional(),
	})
	.strict()
	.openapi("PartnerTourAvailabilityException");

export const PartnerTourAvailabilitySchema = z
	.object({
		status: z.enum(["available", "limited", "unavailable"]),
		timezone: z.literal("Asia/Singapore"),
		weekly_windows: z.array(PartnerTourAvailabilityWindowSchema),
		exceptions: z.array(PartnerTourAvailabilityExceptionSchema),
		notes: z.string().max(1000).nullable(),
		updated_at: z.string().nullable(),
	})
	.strict()
	.openapi("PartnerTourAvailability");

export const PartnerListingEditableFieldsSchema = z
	.object({
		tagline: z.string(),
		about: z.string(),
		highlights: z.array(z.string()),
		right_for_you_if: z.array(z.string()),
		features: z.array(z.string()),
		languages: z.array(z.string()),
	})
	.strict()
	.openapi("PartnerListingEditableFields");

export const PartnerListingLockedFieldsSchema = z
	.object({
		name: z.string(),
		licence: z.string().nullable(),
		year_opened: z.number().int().nullable(),
		capacity: z.number().int().nullable(),
		address: z.string(),
		postal_code: z.string(),
		district: z.string(),
		region_id: z.string(),
		care_types: z.array(z.string()),
		price_from: z.number(),
		price_unit: z.enum(["month", "day"]),
		rating: z.number(),
		review_count: z.number().int(),
		status: z.enum(["draft", "approved", "rejected", "disabled", "removed"]),
		is_enabled: z.boolean(),
		slug: z.string(),
	})
	.strict()
	.openapi("PartnerListingLockedFields");

export const PartnerFacilitySummarySchema = ManagedFacilitySchema.extend({
	tagline: z.string(),
	image_url: z.string(),
	care_types: z.array(z.string()),
	region_id: z.string(),
	district: z.string(),
	rating: z.number(),
	review_count: z.number().int(),
}).openapi("PartnerFacilitySummary");

export const PartnerPermissionsSchema = z
	.object({
		can_edit_listing: z.boolean(),
		can_update_availability: z.boolean(),
		can_update_tour_availability: z.boolean(),
		can_manage_tours: z.boolean(),
		can_respond_to_reviews: z.boolean(),
		can_flag_reviews: z.boolean(),
	})
	.strict()
	.openapi("PartnerPermissions");

export const PartnerTourSummarySchema = z
	.object({
		pending_review: z.number().int(),
		confirmed: z.number().int(),
		attended: z.number().int(),
		no_show: z.number().int(),
		declined: z.number().int(),
		cancelled: z.number().int(),
	})
	.strict()
	.openapi("PartnerTourSummary");

export const PartnerTourRequestSchema = z
	.object({
		id: z.string(),
		facility_id: z.string(),
		status: z.enum([
			"pending_review",
			"confirmed",
			"declined",
			"attended",
			"no_show",
			"cancelled",
		]),
		contact_name: z.string(),
		contact_phone: z.string(),
		contact_email: z.string(),
		preferred_date: z.string(),
		preferred_time: z.string(),
		care_notes: z.string().nullable(),
		scheduled_date: z.string().optional(),
		scheduled_time: z.string().optional(),
		partner_message: z.string().nullable().optional(),
		version: z.number().int(),
		created_at: z.string(),
		updated_at: z.string(),
	})
	.strict()
	.openapi("PartnerTourRequest");

export const PartnerReviewResponseSchema = z
	.object({
		id: z.string(),
		review_id: z.string(),
		facility_id: z.string(),
		body: z.string(),
		status: z.enum(["published", "removed"]),
		version: z.number().int(),
		created_at: z.string(),
		updated_at: z.string(),
	})
	.strict()
	.openapi("PartnerReviewResponse");

export const PartnerReviewFlagSummarySchema = z
	.object({
		pending_count: z.number().int(),
		current_user_pending: z.boolean(),
	})
	.strict()
	.openapi("PartnerReviewFlagSummary");

export const PartnerReviewSchema = z
	.object({
		id: z.string(),
		facility_id: z.string(),
		author_name: z.string(),
		relationship: z.string(),
		rating: z.number(),
		title: z.string(),
		body: z.string(),
		review_date: z.string(),
		verified: z.boolean(),
		status: z.enum(["published", "hidden"]),
		version: z.number().int(),
		response: PartnerReviewResponseSchema.nullable(),
		flags: PartnerReviewFlagSummarySchema,
	})
	.strict()
	.openapi("PartnerReview");

export const PartnerAuditEventSchema = z
	.object({
		id: z.string(),
		action: z.string(),
		resource_type: z.string(),
		resource_id: z.string(),
		metadata: z.unknown(),
		created_at: z.string(),
	})
	.strict()
	.openapi("PartnerAuditEvent");

export const PartnerReferenceDataSchema = z
	.object({
		features: z.array(z.object({ id: z.string(), name: z.string() }).strict()),
		languages: z.array(z.object({ id: z.string(), name: z.string() }).strict()),
	})
	.strict()
	.openapi("PartnerReferenceData");

export const PartnerFacilityManagerDashboardSchema = z
	.object({
		facility: PartnerFacilitySummarySchema,
		permissions: PartnerPermissionsSchema,
		editable_fields: PartnerListingEditableFieldsSchema,
		locked_fields: PartnerListingLockedFieldsSchema,
		availability: PartnerFacilityAvailabilitySchema,
		tour_availability: PartnerTourAvailabilitySchema,
		tour_summary: PartnerTourSummarySchema,
		recent_tour_requests: z.array(PartnerTourRequestSchema),
		recent_edits: z.array(PartnerAuditEventSchema),
		reference_data: PartnerReferenceDataSchema,
	})
	.strict()
	.openapi("PartnerFacilityManagerDashboard");

export const PartnerFacilityAnalyticsSchema = z
	.object({
		facility_id: z.string(),
		period: z
			.object({ from: z.string().nullable(), to: z.string().nullable() })
			.strict(),
		metrics: z
			.object({
				review_count: z.number().int(),
				average_rating: z.number(),
				pending_tour_requests: z.number().int(),
				confirmed_tour_requests: z.number().int(),
			})
			.strict(),
	})
	.strict()
	.openapi("PartnerFacilityAnalytics");

export const PartnerUpdateFacilityAvailabilityRequestSchema =
	PartnerFacilityIdRequestSchema.extend({
		availability: PartnerFacilityAvailabilitySchema.omit({ updated_at: true }),
		expected_version: z.number().int().positive().optional(),
	})
		.strict()
		.openapi("PartnerUpdateFacilityAvailabilityRequest");

export const PartnerUpdateFacilityTourAvailabilityRequestSchema =
	PartnerFacilityIdRequestSchema.extend({
		tour_availability: PartnerTourAvailabilitySchema.omit({ updated_at: true }),
		expected_version: z.number().int().positive().optional(),
	})
		.strict()
		.openapi("PartnerUpdateFacilityTourAvailabilityRequest");

export const PartnerUpdateFacilityManagerListingFieldsRequestSchema =
	PartnerFacilityIdRequestSchema.extend({
		patch: PartnerListingEditableFieldsSchema.partial().strict(),
		expected_version: z.number().int().positive().optional(),
	})
		.strict()
		.openapi("PartnerUpdateFacilityManagerListingFieldsRequest");

export const PartnerTourActionBaseRequestSchema = z
	.object({
		facility_id: z.string().min(1),
		tour_request_id: z.string().min(1),
		expected_version: z.number().int().positive().optional(),
	})
	.strict();

export const PartnerCreateTourRequestConfirmationRequestSchema =
	PartnerTourActionBaseRequestSchema.extend({
		scheduled_date: z.string().min(1).optional(),
		scheduled_time: z.string().min(1).optional(),
		message: z.string().max(2000).nullable().optional(),
	})
		.strict()
		.openapi("PartnerCreateTourRequestConfirmationRequest");

export const PartnerCreateTourRequestDeclineRequestSchema =
	PartnerTourActionBaseRequestSchema.extend({
		reason: z.string().max(1000).nullable().optional(),
		message: z.string().max(2000).nullable().optional(),
	})
		.strict()
		.openapi("PartnerCreateTourRequestDeclineRequest");

export const PartnerCreateTourRequestAttendanceRequestSchema =
	PartnerTourActionBaseRequestSchema.extend({
		attended_at: z.string().optional(),
		note: z.string().max(2000).nullable().optional(),
	})
		.strict()
		.openapi("PartnerCreateTourRequestAttendanceRequest");

export const PartnerCreateTourRequestNoShowRequestSchema =
	PartnerTourActionBaseRequestSchema.extend({
		note: z.string().max(2000).nullable().optional(),
	})
		.strict()
		.openapi("PartnerCreateTourRequestNoShowRequest");

export const PartnerCreateTourRequestCancellationRequestSchema =
	PartnerTourActionBaseRequestSchema.extend({
		reason: z.string().max(1000).nullable().optional(),
		message: z.string().max(2000).nullable().optional(),
	})
		.strict()
		.openapi("PartnerCreateTourRequestCancellationRequest");

export const PartnerCreateFacilityReviewResponseRequestSchema =
	PartnerFacilityIdRequestSchema.extend({
		review_id: z.string().min(1),
		body: z.string().min(1).max(5000),
	})
		.strict()
		.openapi("PartnerCreateFacilityReviewResponseRequest");

export const PartnerUpdateFacilityReviewResponseRequestSchema =
	PartnerFacilityIdRequestSchema.extend({
		review_id: z.string().min(1),
		body: z.string().min(1).max(5000),
		expected_version: z.number().int().positive().optional(),
	})
		.strict()
		.openapi("PartnerUpdateFacilityReviewResponseRequest");

export const PartnerCreateReviewFlagRequestSchema =
	PartnerFacilityIdRequestSchema.extend({
		review_id: z.string().min(1),
		reason: z.enum([
			"inaccurate_info",
			"inappropriate_content",
			"privacy_concern",
			"spam",
			"other",
		]),
		details: z.string().max(2000).nullable().optional(),
	})
		.strict()
		.openapi("PartnerCreateReviewFlagRequest");

export const PartnerReviewFlagSchema = z
	.object({
		id: z.string(),
		review_id: z.string(),
		facility_id: z.string(),
		reason: z.enum([
			"inaccurate_info",
			"inappropriate_content",
			"privacy_concern",
			"spam",
			"other",
		]),
		details: z.string().nullable(),
		status: z.enum(["pending", "accepted", "rejected", "cancelled"]),
		created_at: z.string(),
		updated_at: z.string(),
	})
	.strict()
	.openapi("PartnerReviewFlag");
