import {
	toPartnerFacilityAvailability,
	toPartnerFacilitySummary,
	toPartnerListingEditableFields,
	toPartnerTourAvailability,
	type PartnerFacilityAvailability,
	type PartnerFacilitySummary,
	type PartnerListingEditableFields,
	type PartnerTourAvailability,
} from "@/db/projections/partnerFacilityProjection";
import type {
	PartnerFacilityListingPatch,
	Repositories,
} from "@/db/repositories/ports";
import type { FacilityRow } from "@/db/schema/types";
import {
	normalizeAvailabilityUpdate,
	normalizeTourAvailabilityUpdate,
	type NormalizeAvailabilityInput,
	type NormalizeTourAvailabilityInput,
} from "@/domain/availability/availabilityUpdateRules";
import { AuditWriter } from "@/shared/audit/auditWriter";
import { ApiError } from "@/shared/errors/apiError";
import type { RequestContext } from "@/shared/request-context/context";
import { requirePartnerFacilityScope } from "./partnerFacilityScope";

export interface UpdatePartnerFacilityListingFieldsInput {
	facility_id: string;
	patch: Record<string, unknown>;
	expected_version?: number;
}

export interface UpdatePartnerFacilityAvailabilityInput {
	facility_id: string;
	availability: NormalizeAvailabilityInput;
	expected_version?: number;
}

export interface UpdatePartnerFacilityTourAvailabilityInput {
	facility_id: string;
	tour_availability: NormalizeTourAvailabilityInput;
	expected_version?: number;
}

export interface PartnerFacilityListingFieldsResult {
	facility: PartnerFacilitySummary;
	editable_fields: PartnerListingEditableFields;
}

export interface PartnerFacilityAvailabilityResult {
	facility: PartnerFacilitySummary;
	availability: PartnerFacilityAvailability;
}

export interface PartnerFacilityTourAvailabilityResult {
	facility: PartnerFacilitySummary;
	tour_availability: PartnerTourAvailability;
}

const editableListingFields = [
	"tagline",
	"about",
	"highlights",
	"right_for_you_if",
	"features",
	"languages",
] as const;

const editableListingFieldSet = new Set<string>(editableListingFields);

const lockedListingFieldSet = new Set([
	"name",
	"facility_name",
	"licence",
	"moh_licence",
	"licence_verified",
	"licence_verification_state",
	"year_opened",
	"capacity",
	"address",
	"postal_code",
	"coordinates",
	"latitude",
	"longitude",
	"district",
	"region",
	"region_id",
	"care_types",
	"starting_price",
	"price_from",
	"price_unit",
	"rating",
	"review_count",
	"review_aggregates",
	"status",
	"publication_status",
	"is_enabled",
	"disabled_state",
	"slug",
	"public_slug",
]);

const unsupportedListingFieldSet = new Set([
	"image",
	"image_url",
	"gallery",
	"gallery_urls",
]);

export class PartnerFacilityEditService {
	private readonly audit: AuditWriter;

	constructor(private readonly repos: Repositories) {
		this.audit = new AuditWriter(repos.audit);
	}

	async updateListingFields(
		ctx: RequestContext,
		input: UpdatePartnerFacilityListingFieldsInput,
	): Promise<PartnerFacilityListingFieldsResult> {
		validateListingPatchKeys(input.patch);
		const patch = normalizeListingPatch(input.patch);
		if (Object.keys(patch).length === 0) {
			throw new ApiError(
				"validation_failed",
				"At least one editable listing field is required.",
				422,
			);
		}

		const scope = await requirePartnerFacilityScope(
			ctx,
			this.repos.partnerFacilities,
			input.facility_id,
		);
		const before = structuredClone(scope.facility);
		const updated = await this.repos.partnerFacilities.updateManagerListingFields({
			facilityId: scope.facility_id,
			expectedVersion: input.expected_version,
			patch,
			updatedAt: ctx.now,
		});

		await this.writeFieldAuditRecords(ctx, {
			action: "partner.facility_listing_field_updated",
			facility: updated,
			companyId: scope.company_id,
			fields: changedFieldRecords(before, updated, Object.keys(patch)),
		});

		return {
			facility: toPartnerFacilitySummary(updated),
			editable_fields: toPartnerListingEditableFields(updated),
		};
	}

	async updateAvailability(
		ctx: RequestContext,
		input: UpdatePartnerFacilityAvailabilityInput,
	): Promise<PartnerFacilityAvailabilityResult> {
		const normalized = normalizeAvailabilityUpdate(input.availability);
		const scope = await requirePartnerFacilityScope(
			ctx,
			this.repos.partnerFacilities,
			input.facility_id,
		);
		const before = structuredClone(scope.facility);
		const updated = await this.repos.partnerFacilities.updateAvailability({
			facilityId: scope.facility_id,
			expectedVersion: input.expected_version,
			status: normalized.status,
			bedsAvailable: normalized.beds_available,
			note: normalized.note,
			updatedAt: ctx.now,
		});

		await this.writeFieldAuditRecords(ctx, {
			action: "partner.facility_availability_field_updated",
			facility: updated,
			companyId: scope.company_id,
			fields: [
				fieldChange(
					"availability_status",
					before.availability_status,
					updated.availability_status,
				),
				fieldChange("beds_available", before.beds_available, updated.beds_available),
				fieldChange(
					"availability_note",
					before.availability_note,
					updated.availability_note,
				),
			].filter(isFieldChange),
		});

		return {
			facility: toPartnerFacilitySummary(updated),
			availability: toPartnerFacilityAvailability(updated),
		};
	}

	async updateTourAvailability(
		ctx: RequestContext,
		input: UpdatePartnerFacilityTourAvailabilityInput,
	): Promise<PartnerFacilityTourAvailabilityResult> {
		const normalized = normalizeTourAvailabilityUpdate(input.tour_availability);
		const scope = await requirePartnerFacilityScope(
			ctx,
			this.repos.partnerFacilities,
			input.facility_id,
		);
		const before = structuredClone(scope.facility);
		const updated = await this.repos.partnerFacilities.updateTourAvailability({
			facilityId: scope.facility_id,
			expectedVersion: input.expected_version,
			tourAvailability: normalized,
			updatedAt: ctx.now,
		});

		await this.writeFieldAuditRecords(ctx, {
			action: "partner.facility_tour_availability_field_updated",
			facility: updated,
			companyId: scope.company_id,
			fields: [
				fieldChange(
					"tour_availability",
					before.tour_availability,
					updated.tour_availability,
				),
			].filter(isFieldChange),
		});

		return {
			facility: toPartnerFacilitySummary(updated),
			tour_availability: toPartnerTourAvailability(updated),
		};
	}

	private async writeFieldAuditRecords(
		ctx: RequestContext,
		input: {
			action: string;
			facility: FacilityRow;
			companyId: string;
			fields: FieldChange[];
		},
	) {
		await Promise.all(
			input.fields.map((change) =>
				this.audit.write(ctx, {
					action: input.action,
					resourceType: "facility",
					resourceId: input.facility.id,
					before: change.before,
					after: change.after,
					diff: change,
					metadata: {
						facility_id: input.facility.id,
						company_id: input.companyId,
						field: change.field,
						facility_version: input.facility.version,
					},
				}),
			),
		);
	}
}

interface FieldChange {
	field: string;
	before: unknown;
	after: unknown;
}

function validateListingPatchKeys(patch: Record<string, unknown>) {
	const providedFields = Object.keys(patch);
	const lockedFields = providedFields.filter((field) =>
		lockedListingFieldSet.has(field),
	);
	const unsupportedFields = providedFields.filter(
		(field) =>
			!editableListingFieldSet.has(field) &&
			!lockedListingFieldSet.has(field),
	);
	if (lockedFields.length > 0 || unsupportedFields.length > 0) {
		throw new ApiError(
			"validation_failed",
			"Listing patch contains fields that partner users cannot edit.",
			422,
			{
				locked_fields: lockedFields,
				unsupported_fields: unsupportedFields.filter(
					(field) => !unsupportedListingFieldSet.has(field),
				),
				deferred_media_fields: unsupportedFields.filter((field) =>
					unsupportedListingFieldSet.has(field),
				),
			},
		);
	}
}

function normalizeListingPatch(
	patch: Record<string, unknown>,
): PartnerFacilityListingPatch {
	const normalized: PartnerFacilityListingPatch = {};
	for (const field of editableListingFields) {
		if (!(field in patch) || patch[field] === undefined) continue;
		switch (field) {
			case "tagline":
			case "about":
				normalized[field] = normalizeStringField(patch[field], field);
				break;
			case "highlights":
			case "right_for_you_if":
			case "features":
			case "languages":
				normalized[field] = normalizeStringArrayField(patch[field], field);
				break;
		}
	}
	return normalized;
}

function normalizeStringField(value: unknown, field: string) {
	if (typeof value !== "string") {
		throw new ApiError("validation_failed", `${field} must be a string.`, 422, {
			field,
		});
	}
	return value.trim();
}

function normalizeStringArrayField(value: unknown, field: string) {
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
		throw new ApiError(
			"validation_failed",
			`${field} must be an array of strings.`,
			422,
			{ field },
		);
	}
	return value
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}

function changedFieldRecords(
	before: FacilityRow,
	after: FacilityRow,
	fields: string[],
) {
	return fields
		.map((field) =>
			fieldChange(
				field,
				before[field as keyof FacilityRow],
				after[field as keyof FacilityRow],
			),
		)
		.filter(isFieldChange);
}

function fieldChange(
	field: string,
	before: unknown,
	after: unknown,
): FieldChange | null {
	if (JSON.stringify(before) === JSON.stringify(after)) return null;
	return { field, before, after };
}

function isFieldChange(change: FieldChange | null): change is FieldChange {
	return change !== null;
}
