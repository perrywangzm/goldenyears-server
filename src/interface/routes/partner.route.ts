import { createRoute, z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { createAuthServices } from "@/application/auth/createAuthServices";
import { PartnerDashboardService } from "@/application/partner/partnerDashboardService";
import { PartnerFacilityEditService } from "@/application/partner/partnerFacilityEditService";
import { PartnerService } from "@/application/partner/partnerService";
import { PartnerWorkflowService } from "@/application/partner/partnerWorkflowService";
import type { AppBindings } from "@/config/env";
import type { AppOpenAPI } from "@/interface/app";
import { readJson } from "@/interface/http/requestValidation";
import {
	ListManagedFacilitiesRequestSchema,
	ManagedFacilitySchema,
	PartnerAuditEventSchema,
	PartnerCreateFacilityReviewResponseRequestSchema,
	PartnerCreateReviewFlagRequestSchema,
	PartnerCreateTourRequestAttendanceRequestSchema,
	PartnerCreateTourRequestCancellationRequestSchema,
	PartnerCreateTourRequestConfirmationRequestSchema,
	PartnerCreateTourRequestDeclineRequestSchema,
	PartnerCreateTourRequestNoShowRequestSchema,
	PartnerFacilityAnalyticsSchema,
	PartnerFacilityAvailabilitySchema,
	PartnerFacilityManagerDashboardSchema,
	PartnerFacilitySummarySchema,
	PartnerGetFacilityAnalyticsRequestSchema,
	PartnerGetFacilityManagerDashboardRequestSchema,
	PartnerListFacilityAuditEventsRequestSchema,
	PartnerListFacilityReviewsRequestSchema,
	PartnerListFacilityTourRequestsRequestSchema,
	PartnerListingEditableFieldsSchema,
	PartnerLoginRequestSchema,
	PartnerLoginResponseSchema,
	PartnerMeSchema,
	PartnerReviewFlagSchema,
	PartnerReviewSchema,
	PartnerTourAvailabilitySchema,
	PartnerTourRequestSchema,
	PartnerUpdateFacilityAvailabilityRequestSchema,
	PartnerUpdateFacilityManagerListingFieldsRequestSchema,
	PartnerUpdateFacilityReviewResponseRequestSchema,
	PartnerUpdateFacilityTourAvailabilityRequestSchema,
} from "@/interface/schemas/partner.schema";
import {
	dataEnvelope,
	dataEnvelopeSchema,
	EmptyJsonBodySchema,
	ErrorEnvelopeSchema,
	listEnvelopeSchema,
} from "@/shared/envelopes/envelope";
import {
	OffsetPageResponseSchema,
	resolveOffsetPage,
} from "@/shared/pagination/page.schema";
import type { RequestContext } from "@/shared/request-context/context";

type RouteConfigWithExtensions = Parameters<typeof createRoute>[0] & {
	"x-goldenyears-invalidates"?: string[];
};

const IdempotencyHeaderSchema = z
	.object({
		"Idempotency-Key": z.string().min(1).optional(),
	})
	.openapi("PartnerIdempotencyHeaders");

const PartnerUpdateFacilityAvailabilityResponseSchema = z
	.object({
		facility: PartnerFacilitySummarySchema,
		availability: PartnerFacilityAvailabilitySchema,
	})
	.strict()
	.openapi("PartnerUpdateFacilityAvailabilityResponseData");

const PartnerUpdateFacilityTourAvailabilityResponseSchema = z
	.object({
		facility: PartnerFacilitySummarySchema,
		tour_availability: PartnerTourAvailabilitySchema,
	})
	.strict()
	.openapi("PartnerUpdateFacilityTourAvailabilityResponseData");

const PartnerUpdateFacilityManagerListingFieldsResponseSchema = z
	.object({
		facility: PartnerFacilitySummarySchema,
		editable_fields: PartnerListingEditableFieldsSchema,
	})
	.strict()
	.openapi("PartnerUpdateFacilityManagerListingFieldsResponseData");

export function registerPartnerRoutes(app: AppOpenAPI) {
	app.openapi(
		createRoute({
			method: "post",
			path: "/api/v1/partner/auth/login",
			operationId: "partner_auth_login",
			tags: ["partner"],
			request: { body: jsonBody(PartnerLoginRequestSchema) },
			responses: ok(
				dataEnvelopeSchema(PartnerLoginResponseSchema, "PartnerLoginResponse"),
			),
			"x-goldenyears-invalidates": ["session", "partner_account"],
		} satisfies RouteConfigWithExtensions),
		async (c) =>
			c.json(
				dataEnvelope(
					await createAuthServices(
						c.env,
						c.get("repos"),
						c.get("supabaseAuth"),
					).sessions.createSession(
						await readJson(c, PartnerLoginRequestSchema),
						c,
						"partner",
					),
				),
				200,
			),
	);

	app.openapi(
		createRoute({
			method: "post",
			path: "/api/v1/partner/auth/logout",
			operationId: "partner_auth_logout",
			tags: ["partner"],
			request: { body: jsonBody(EmptyJsonBodySchema) },
			responses: ok(
				dataEnvelopeSchema(
					z.object({ id: z.string() }),
					"PartnerLogoutResponse",
				),
			),
			"x-goldenyears-invalidates": ["session", "partner_account"],
		} satisfies RouteConfigWithExtensions),
		async (c) =>
			c.json(
				dataEnvelope(
					await createAuthServices(
						c.env,
						c.get("repos"),
						c.get("supabaseAuth"),
					).sessions.deleteSession(context(c), c, "partner"),
				),
				200,
			),
	);

	app.openapi(
		createRoute({
			method: "post",
			path: "/api/v1/partner/get_me",
			operationId: "partner_get_me",
			tags: ["partner"],
			request: { body: jsonBody(EmptyJsonBodySchema) },
			responses: ok(
				dataEnvelopeSchema(PartnerMeSchema, "PartnerGetMeResponse"),
			),
		}),
		async (c) =>
			c.json(
				dataEnvelope(
					await new PartnerService(c.get("repos")).getMe(
						context(c),
						getCookie(c, "gy_partner_session_csrf") ?? null,
					),
				),
				200,
			),
	);

	app.openapi(
		createRoute({
			method: "post",
			path: "/api/v1/partner/list_managed_facilities",
			operationId: "partner_list_managed_facilities",
			tags: ["partner"],
			request: { body: jsonBody(ListManagedFacilitiesRequestSchema) },
			responses: ok(
				listEnvelopeSchema(
					ManagedFacilitySchema,
					OffsetPageResponseSchema,
					"PartnerListManagedFacilitiesResponse",
				),
			),
		}),
		async (c) => {
			const page = resolveOffsetPage(
				(await readJson(c, ListManagedFacilitiesRequestSchema)).page,
			);
			const result = await new PartnerService(
				c.get("repos"),
			).listManagedFacilities(context(c), page);
			return c.json(result, 200);
		},
	);

	app.openapi(
		createRoute({
			method: "post",
			path: "/api/v1/partner/get_facility_manager_dashboard",
			operationId: "partner_get_facility_manager_dashboard",
			tags: ["partner"],
			request: {
				body: jsonBody(PartnerGetFacilityManagerDashboardRequestSchema),
			},
			responses: ok(
				dataEnvelopeSchema(
					PartnerFacilityManagerDashboardSchema,
					"PartnerGetFacilityManagerDashboardResponse",
				),
			),
		}),
		async (c) => {
			const body = await readJson(
				c,
				PartnerGetFacilityManagerDashboardRequestSchema,
			);
			const result = await new PartnerDashboardService(
				c.get("repos"),
			).getFacilityManagerDashboard(context(c), body);
			return c.json(dataEnvelope(result), 200);
		},
	);

	app.openapi(
		createRoute({
			method: "post",
			path: "/api/v1/partner/list_facility_tour_requests",
			operationId: "partner_list_facility_tour_requests",
			tags: ["partner"],
			request: { body: jsonBody(PartnerListFacilityTourRequestsRequestSchema) },
			responses: ok(
				listEnvelopeSchema(
					PartnerTourRequestSchema,
					OffsetPageResponseSchema,
					"PartnerListFacilityTourRequestsResponse",
				),
			),
		}),
		async (c) => {
			const body = await readJson(c, PartnerListFacilityTourRequestsRequestSchema);
			const page = resolveOffsetPage(body.page);
			const result = await new PartnerWorkflowService(
				c.get("repos"),
				c.get("transactionRunner"),
			).listFacilityTourRequests(context(c), {
				facility_id: body.facility_id,
				statuses: body.statuses,
				limit: page.limit,
				offset: page.offset,
			});
			return c.json(result, 200);
		},
	);

	app.openapi(
		createRoute({
			method: "post",
			path: "/api/v1/partner/list_facility_reviews",
			operationId: "partner_list_facility_reviews",
			tags: ["partner"],
			request: { body: jsonBody(PartnerListFacilityReviewsRequestSchema) },
			responses: ok(
				listEnvelopeSchema(
					PartnerReviewSchema,
					OffsetPageResponseSchema,
					"PartnerListFacilityReviewsResponse",
				),
			),
		}),
		async (c) => {
			const body = await readJson(c, PartnerListFacilityReviewsRequestSchema);
			const page = resolveOffsetPage(body.page);
			const result = await new PartnerWorkflowService(
				c.get("repos"),
				c.get("transactionRunner"),
			).listFacilityReviews(context(c), {
				facility_id: body.facility_id,
				statuses: body.statuses,
				limit: page.limit,
				offset: page.offset,
			});
			return c.json(result, 200);
		},
	);

	app.openapi(
		createRoute({
			method: "post",
			path: "/api/v1/partner/get_facility_analytics",
			operationId: "partner_get_facility_analytics",
			tags: ["partner"],
			request: { body: jsonBody(PartnerGetFacilityAnalyticsRequestSchema) },
			responses: ok(
				dataEnvelopeSchema(
					PartnerFacilityAnalyticsSchema,
					"PartnerGetFacilityAnalyticsResponse",
				),
			),
		}),
		async (c) => {
			const body = await readJson(c, PartnerGetFacilityAnalyticsRequestSchema);
			const result = await new PartnerDashboardService(
				c.get("repos"),
			).getFacilityAnalytics(context(c), body);
			return c.json(dataEnvelope(result), 200);
		},
	);

	app.openapi(
		createRoute({
			method: "post",
			path: "/api/v1/partner/list_facility_audit_events",
			operationId: "partner_list_facility_audit_events",
			tags: ["partner"],
			request: { body: jsonBody(PartnerListFacilityAuditEventsRequestSchema) },
			responses: ok(
				listEnvelopeSchema(
					PartnerAuditEventSchema,
					OffsetPageResponseSchema,
					"PartnerListFacilityAuditEventsResponse",
				),
			),
		}),
		async (c) => {
			const body = await readJson(c, PartnerListFacilityAuditEventsRequestSchema);
			const page = resolveOffsetPage(body.page);
			const result = await new PartnerDashboardService(
				c.get("repos"),
			).listFacilityAuditEvents(context(c), {
				facility_id: body.facility_id,
				actions: body.actions,
				limit: page.limit,
				offset: page.offset,
			});
			return c.json(result, 200);
		},
	);

	app.openapi(
		createRoute({
			method: "post",
			path: "/api/v1/partner/update_facility_availability",
			operationId: "partner_update_facility_availability",
			tags: ["partner"],
			request: { body: jsonBody(PartnerUpdateFacilityAvailabilityRequestSchema) },
			responses: ok(
				dataEnvelopeSchema(
					PartnerUpdateFacilityAvailabilityResponseSchema,
					"PartnerUpdateFacilityAvailabilityResponse",
				),
			),
			"x-goldenyears-invalidates": ["facility", "partner_dashboard"],
		} satisfies RouteConfigWithExtensions),
		async (c) => {
			const body = await readJson(
				c,
				PartnerUpdateFacilityAvailabilityRequestSchema,
			);
			const result = await new PartnerFacilityEditService(
				c.get("repos"),
			).updateAvailability(context(c), body);
			return c.json(dataEnvelope(result), 200);
		},
	);

	app.openapi(
		createRoute({
			method: "post",
			path: "/api/v1/partner/update_facility_tour_availability",
			operationId: "partner_update_facility_tour_availability",
			tags: ["partner"],
			request: {
				body: jsonBody(PartnerUpdateFacilityTourAvailabilityRequestSchema),
			},
			responses: ok(
				dataEnvelopeSchema(
					PartnerUpdateFacilityTourAvailabilityResponseSchema,
					"PartnerUpdateFacilityTourAvailabilityResponse",
				),
			),
			"x-goldenyears-invalidates": [
				"facility",
				"tour_availability",
				"partner_dashboard",
			],
		} satisfies RouteConfigWithExtensions),
		async (c) => {
			const body = await readJson(
				c,
				PartnerUpdateFacilityTourAvailabilityRequestSchema,
			);
			const result = await new PartnerFacilityEditService(
				c.get("repos"),
			).updateTourAvailability(context(c), body);
			return c.json(dataEnvelope(result), 200);
		},
	);

	app.openapi(
		createRoute({
			method: "post",
			path: "/api/v1/partner/update_facility_manager_listing_fields",
			operationId: "partner_update_facility_manager_listing_fields",
			tags: ["partner"],
			request: {
				body: jsonBody(PartnerUpdateFacilityManagerListingFieldsRequestSchema),
			},
			responses: ok(
				dataEnvelopeSchema(
					PartnerUpdateFacilityManagerListingFieldsResponseSchema,
					"PartnerUpdateFacilityManagerListingFieldsResponse",
				),
			),
			"x-goldenyears-invalidates": ["facility", "partner_dashboard"],
		} satisfies RouteConfigWithExtensions),
		async (c) => {
			const body = await readJson(
				c,
				PartnerUpdateFacilityManagerListingFieldsRequestSchema,
			);
			const result = await new PartnerFacilityEditService(
				c.get("repos"),
			).updateListingFields(context(c), body);
			return c.json(dataEnvelope(result), 200);
		},
	);

	registerTourActionRoute(app, {
		path: "/api/v1/partner/create_tour_request_confirmation",
		operationId: "partner_create_tour_request_confirmation",
		requestSchema: PartnerCreateTourRequestConfirmationRequestSchema,
		responseName: "PartnerCreateTourRequestConfirmationResponse",
		handler: (service, ctx, input) =>
			service.createTourRequestConfirmation(ctx, input),
		invalidates: ["tour_request", "partner_dashboard", "notification"],
	});
	registerTourActionRoute(app, {
		path: "/api/v1/partner/create_tour_request_decline",
		operationId: "partner_create_tour_request_decline",
		requestSchema: PartnerCreateTourRequestDeclineRequestSchema,
		responseName: "PartnerCreateTourRequestDeclineResponse",
		handler: (service, ctx, input) =>
			service.createTourRequestDecline(ctx, input),
		invalidates: ["tour_request", "partner_dashboard", "notification"],
	});
	registerTourActionRoute(app, {
		path: "/api/v1/partner/create_tour_request_attendance",
		operationId: "partner_create_tour_request_attendance",
		requestSchema: PartnerCreateTourRequestAttendanceRequestSchema,
		responseName: "PartnerCreateTourRequestAttendanceResponse",
		handler: (service, ctx, input) =>
			service.createTourRequestAttendance(ctx, input),
		invalidates: ["tour_request", "partner_dashboard", "notification"],
	});
	registerTourActionRoute(app, {
		path: "/api/v1/partner/create_tour_request_no_show",
		operationId: "partner_create_tour_request_no_show",
		requestSchema: PartnerCreateTourRequestNoShowRequestSchema,
		responseName: "PartnerCreateTourRequestNoShowResponse",
		handler: (service, ctx, input) => service.createTourRequestNoShow(ctx, input),
		invalidates: ["tour_request", "partner_dashboard", "notification"],
	});
	registerTourActionRoute(app, {
		path: "/api/v1/partner/create_tour_request_cancellation",
		operationId: "partner_create_tour_request_cancellation",
		requestSchema: PartnerCreateTourRequestCancellationRequestSchema,
		responseName: "PartnerCreateTourRequestCancellationResponse",
		handler: (service, ctx, input) =>
			service.createTourRequestCancellation(ctx, input),
		invalidates: ["tour_request", "partner_dashboard", "notification"],
	});

	app.openapi(
		createRoute({
			method: "post",
			path: "/api/v1/partner/create_facility_review_response",
			operationId: "partner_create_facility_review_response",
			tags: ["partner"],
			request: {
				headers: IdempotencyHeaderSchema,
				body: jsonBody(PartnerCreateFacilityReviewResponseRequestSchema),
			},
			responses: ok(
				dataEnvelopeSchema(
					PartnerReviewSchema,
					"PartnerCreateFacilityReviewResponseResponse",
				),
			),
			"x-goldenyears-invalidates": [
				"review",
				"partner_dashboard",
				"notification",
			],
		} satisfies RouteConfigWithExtensions),
		async (c) => {
			const body = await readJson(
				c,
				PartnerCreateFacilityReviewResponseRequestSchema,
			);
			const result = await new PartnerWorkflowService(
				c.get("repos"),
				c.get("transactionRunner"),
			).createFacilityReviewResponse(idempotentContext(c), body);
			return c.json(dataEnvelope(result), 200);
		},
	);

	app.openapi(
		createRoute({
			method: "post",
			path: "/api/v1/partner/update_facility_review_response",
			operationId: "partner_update_facility_review_response",
			tags: ["partner"],
			request: {
				headers: IdempotencyHeaderSchema,
				body: jsonBody(PartnerUpdateFacilityReviewResponseRequestSchema),
			},
			responses: ok(
				dataEnvelopeSchema(
					PartnerReviewSchema,
					"PartnerUpdateFacilityReviewResponseResponse",
				),
			),
			"x-goldenyears-invalidates": [
				"review",
				"partner_dashboard",
				"notification",
			],
		} satisfies RouteConfigWithExtensions),
		async (c) => {
			const body = await readJson(
				c,
				PartnerUpdateFacilityReviewResponseRequestSchema,
			);
			const result = await new PartnerWorkflowService(
				c.get("repos"),
				c.get("transactionRunner"),
			).updateFacilityReviewResponse(idempotentContext(c), body);
			return c.json(dataEnvelope(result), 200);
		},
	);

	app.openapi(
		createRoute({
			method: "post",
			path: "/api/v1/partner/create_review_flag",
			operationId: "partner_create_review_flag",
			tags: ["partner"],
			request: {
				headers: IdempotencyHeaderSchema,
				body: jsonBody(PartnerCreateReviewFlagRequestSchema),
			},
			responses: ok(
				dataEnvelopeSchema(
					PartnerReviewFlagSchema,
					"PartnerCreateReviewFlagResponse",
				),
			),
			"x-goldenyears-invalidates": [
				"review",
				"review_flag",
				"partner_dashboard",
				"notification",
			],
		} satisfies RouteConfigWithExtensions),
		async (c) => {
			const body = await readJson(c, PartnerCreateReviewFlagRequestSchema);
			const result = await new PartnerWorkflowService(
				c.get("repos"),
				c.get("transactionRunner"),
			).createReviewFlag(idempotentContext(c), body);
			return c.json(dataEnvelope(result), 200);
		},
	);
}

function registerTourActionRoute<TSchema extends z.ZodTypeAny>(
	app: AppOpenAPI,
	config: {
		path: `/api/v1/partner/${string}`;
		operationId: `partner_${string}`;
		requestSchema: TSchema;
		responseName: string;
		invalidates: string[];
		handler: (
			service: PartnerWorkflowService,
			ctx: RequestContext,
			input: z.infer<TSchema>,
		) => Promise<z.infer<typeof PartnerTourRequestSchema>>;
	},
) {
	app.openapi(
		createRoute({
			method: "post",
			path: config.path,
			operationId: config.operationId,
			tags: ["partner"],
			request: {
				headers: IdempotencyHeaderSchema,
				body: jsonBody(config.requestSchema),
			},
			responses: ok(
				dataEnvelopeSchema(PartnerTourRequestSchema, config.responseName),
			),
			"x-goldenyears-invalidates": config.invalidates,
		} satisfies RouteConfigWithExtensions),
		async (c) => {
			const body = await readJson(c, config.requestSchema);
			const result = await config.handler(
				new PartnerWorkflowService(c.get("repos"), c.get("transactionRunner")),
				idempotentContext(c),
				body,
			);
			return c.json(dataEnvelope(result), 200);
		},
	);
}

function idempotentContext(c: Context<AppBindings>): RequestContext {
	return {
		...context(c),
		idempotencyKey: c.req.header("Idempotency-Key") ?? null,
	};
}

function context(c: Context<AppBindings>): RequestContext {
	return {
		requestId: c.get("requestId"),
		actor: c.get("actor"),
		now: new Date(),
	};
}

function jsonBody(schema: z.ZodTypeAny) {
	return { required: true, content: { "application/json": { schema } } };
}

function ok(schema: z.ZodTypeAny) {
	return {
		200: {
			description: "Successful response.",
			content: { "application/json": { schema } },
		},
		400: errorResponse("Bad request."),
		401: errorResponse("Unauthenticated."),
		403: errorResponse("Forbidden."),
		404: errorResponse("Not found."),
		409: errorResponse("Conflict."),
		422: errorResponse("Validation failed."),
	};
}

function errorResponse(description: string) {
	return {
		description,
		content: { "application/json": { schema: ErrorEnvelopeSchema } },
	};
}
