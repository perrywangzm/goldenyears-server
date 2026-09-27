import type { Kysely, Transaction } from "kysely";
import type {
	Database,
	FacilityRow,
	NewFacilityRow,
	ReferenceItemRow,
	ReviewFlagRow,
	ReviewResponseRow,
	TourRequestRow,
	UserRow,
	UsersTable,
} from "@/db/schema/types";
import { queryPublicFacilities } from "@/domain/search/publicFacilityQuery";
import type { SessionAudience } from "@/shared/authz/sessionAudience";
import { ApiError } from "@/shared/errors/apiError";
import type { ActorRole } from "@/shared/request-context/context";
import type { FacilitySearchInput } from "./facilityRepository";
import type {
	AuditRecord,
	IdempotencyRepositoryPort,
	OutboxRecord,
	PartnerCreateReviewFlagInput,
	PartnerCreateReviewResponseInput,
	PartnerFindFacilityReviewInput,
	PartnerFindFacilityTourRequestInput,
	PartnerListAuditEventsInput,
	PartnerListFacilityReviewsInput,
	PartnerListFacilityTourRequestsInput,
	PartnerTourSummary,
	PartnerUpdateFacilityAvailabilityInput,
	PartnerUpdateFacilityListingFieldsInput,
	PartnerUpdateFacilityTourAvailabilityInput,
	PartnerUpdateReviewResponseInput,
	PartnerUpdateTourRequestStatusInput,
	Repositories,
	SavedFacilityRecord,
} from "./ports";

type DbExecutor = Kysely<Database> | Transaction<Database>;

function generatedId(prefix: string) {
	return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function versionConflict(details: Record<string, unknown>) {
	return new ApiError("conflict", "Version conflict.", 409, details);
}

function isUniqueViolation(error: unknown) {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "23505"
	);
}

export class KyselyFacilityRepository {
	constructor(private readonly db: DbExecutor) {}

	async upsert(row: NewFacilityRow) {
		await this.db
			.insertInto("facilities")
			.values(row as never)
			.onConflict((oc) => oc.column("slug").doUpdateSet(row as never))
			.execute();

		return this.findBySlug(row.slug);
	}

	async findBySlug(slug: string) {
		return this.db
			.selectFrom("facilities")
			.selectAll()
			.where("slug", "=", slug)
			.executeTakeFirst();
	}

	async listPublic(input: FacilitySearchInput) {
		const rows = await this.db
			.selectFrom("facilities")
			.selectAll()
			.where("status", "=", "approved")
			.where("is_enabled", "=", true)
			.execute();
		return queryPublicFacilities(rows as FacilityRow[], input);
	}

	async findPublicById(idOrSlug: string) {
		const row = await this.db
			.selectFrom("facilities")
			.selectAll()
			.where((eb) =>
				eb.or([eb("id", "=", idOrSlug), eb("slug", "=", idOrSlug)]),
			)
			.where("status", "=", "approved")
			.where("is_enabled", "=", true)
			.executeTakeFirst();

		if (!row) {
			throw new ApiError("facility_not_found", "Facility was not found.", 404, {
				id: idOrSlug,
			});
		}
		return row;
	}

	async listPublicByIds(ids: Set<string>) {
		if (ids.size === 0) {
			return [];
		}
		return this.db
			.selectFrom("facilities")
			.selectAll()
			.where("id", "in", [...ids])
			.where("status", "=", "approved")
			.where("is_enabled", "=", true)
			.execute();
	}
}

export class KyselyReferenceRepository {
	constructor(private readonly db: DbExecutor) {}

	async list(kind?: ReferenceItemRow["kind"]) {
		let query = this.db
			.selectFrom("reference_items")
			.selectAll()
			.orderBy("sort_order", "asc")
			.orderBy("name", "asc");
		if (kind) {
			query = query.where("kind", "=", kind);
		}
		return query.execute();
	}

	async getSearchOptions() {
		const [referenceItems, publicFacilities] = await Promise.all([
			this.list(),
			this.db
				.selectFrom("facilities")
				.select(["features", "languages", "price_from"])
				.where("status", "=", "approved")
				.where("is_enabled", "=", true)
				.execute(),
		]);

		const byKind = (kind: ReferenceItemRow["kind"]) =>
			referenceItems
				.filter((item) => item.kind === kind)
				.map(({ id, name }) => ({ id, name }));

		const fallbackFeatures = [
			...new Set(publicFacilities.flatMap((facility) => facility.features)),
		].map((id) => ({
			id,
			name: id.replaceAll("_", " "),
		}));
		const fallbackLanguages = [
			...new Set(publicFacilities.flatMap((facility) => facility.languages)),
		].map((id) => ({
			id,
			name: id,
		}));
		const prices = publicFacilities.map((facility) => facility.price_from);

		return {
			care_types: byKind("care_type"),
			regions: byKind("region"),
			features:
				byKind("feature").length > 0 ? byKind("feature") : fallbackFeatures,
			languages:
				byKind("language").length > 0 ? byKind("language") : fallbackLanguages,
			price_range: {
				min: prices.length > 0 ? Math.min(...prices) : 0,
				max: prices.length > 0 ? Math.max(...prices) : 0,
				currency: "SGD",
			},
		};
	}
}

export class KyselyUserRepository {
	constructor(private readonly db: DbExecutor) {}

	async findByEmail(email: string) {
		return this.db
			.selectFrom("users")
			.selectAll()
			.where("email", "=", email.toLowerCase())
			.executeTakeFirst();
	}

	async findById(id: string) {
		return this.db
			.selectFrom("users")
			.selectAll()
			.where("id", "=", id)
			.executeTakeFirst();
	}

	async findByAuthUserId(authUserId: string) {
		return this.db
			.selectFrom("users")
			.selectAll()
			.where("auth_user_id", "=", authUserId)
			.executeTakeFirst();
	}

	async linkAuthUserId(
		userId: string,
		authUserId: string,
		patch?: { display_name?: string },
	) {
		try {
			const linked = await this.db
				.updateTable("users")
				.set({
					auth_user_id: authUserId,
					...(patch?.display_name ? { display_name: patch.display_name } : {}),
					updated_at: new Date(),
				})
				.where("id", "=", userId)
				.where((eb) =>
					eb.or([
						eb("auth_user_id", "is", null),
						eb("auth_user_id", "=", authUserId),
					]),
				)
				.returningAll()
				.executeTakeFirst();
			if (linked) return linked;
		} catch (error) {
			const owner = await this.findByAuthUserId(authUserId);
			if (owner?.id === userId) return owner;
			throw new ApiError(
				"conflict",
				"This identity is linked to a different account.",
				409,
			);
		}
		const current = await this.findById(userId);
		if (current?.auth_user_id === authUserId) return current;
		throw new ApiError(
			"conflict",
			"This account is linked to a different identity.",
			409,
		);
	}

	async createFromAuthIdentity(input: {
		auth_user_id: string;
		email: string;
		display_name: string;
		status: UsersTable["status"];
	}): Promise<UserRow> {
		const now = new Date();
		const row: UserRow = {
			id: `usr_${crypto.randomUUID().replaceAll("-", "")}`,
			auth_user_id: input.auth_user_id,
			email: input.email.toLowerCase(),
			display_name: input.display_name,
			password_hash: null,
			status: input.status,
			created_at: now,
			updated_at: now,
		};
		await this.db
			.insertInto("users")
			.values(row as never)
			.execute();
		return row;
	}

	async updateProfile(userId: string, patch: { display_name?: string }) {
		await this.db
			.updateTable("users")
			.set({
				...(patch.display_name ? { display_name: patch.display_name } : {}),
				updated_at: new Date(),
			})
			.where("id", "=", userId)
			.execute();
		return (await this.findById(userId))!;
	}

	async rolesForUser(userId: string): Promise<ActorRole[]> {
		const user = await this.findById(userId);
		if (user?.status !== "active") return [];
		const rows = await this.db
			.selectFrom("user_roles")
			.select("role_id")
			.where("user_roles.user_id", "=", userId)
			.where("role_id", "in", ["admin", "moderator", "cms_editor"])
			.execute();
		return rows.map((row) => row.role_id as Exclude<ActorRole, "anonymous">);
	}

	async create(row: UsersTable) {
		await this.db
			.insertInto("users")
			.values(row as never)
			.execute();
		return row;
	}
}

export class KyselyCompanyRepository {
	constructor(private readonly db: DbExecutor) {}

	async findById(id: string) {
		return this.db
			.selectFrom("companies")
			.selectAll()
			.where("id", "=", id)
			.executeTakeFirst();
	}

	async listActiveForUser(userId: string) {
		return this.db
			.selectFrom("companies")
			.innerJoin("company_users", "company_users.company_id", "companies.id")
			.selectAll("companies")
			.where("company_users.user_id", "=", userId)
			.where("company_users.status", "=", "active")
			.where("companies.status", "=", "active")
			.orderBy("companies.name", "asc")
			.execute();
	}
}

export class KyselyCompanyUserRepository {
	constructor(private readonly db: DbExecutor) {}

	async listActiveForUser(userId: string) {
		return this.db
			.selectFrom("company_users")
			.innerJoin("companies", "companies.id", "company_users.company_id")
			.selectAll("company_users")
			.where("company_users.user_id", "=", userId)
			.where("company_users.status", "=", "active")
			.where("companies.status", "=", "active")
			.execute();
	}

	async findActiveMembership(userId: string, companyId: string) {
		return this.db
			.selectFrom("company_users")
			.innerJoin("companies", "companies.id", "company_users.company_id")
			.selectAll("company_users")
			.where("company_users.user_id", "=", userId)
			.where("company_users.company_id", "=", companyId)
			.where("company_users.status", "=", "active")
			.where("companies.status", "=", "active")
			.executeTakeFirst();
	}

	async countActiveCompanies(userId: string) {
		return (await this.listActiveForUser(userId)).length;
	}
}

export class KyselySessionRepository {
	constructor(private readonly db: DbExecutor) {}

	async create(row: import("@/db/schema/types").SessionRow) {
		await this.db
			.insertInto("sessions")
			.values(row as never)
			.execute();
		return row;
	}

	async findActiveByTokenHash(
		tokenHash: string,
		audience: SessionAudience,
		now = new Date(),
	) {
		return this.db
			.selectFrom("sessions")
			.selectAll()
			.where("token_hash", "=", tokenHash)
			.where("audience", "=", audience)
			.where("expires_at", ">", now)
			.where("revoked_at", "is", null)
			.executeTakeFirst();
	}

	async revoke(sessionId: string, now = new Date()) {
		await this.db
			.updateTable("sessions")
			.set({ revoked_at: now })
			.where("id", "=", sessionId)
			.execute();
	}
}

export class KyselyPartnerFacilityRepository {
	constructor(private readonly db: DbExecutor) {}

	async listAccessibleForUser(
		userId: string,
		input: { limit: number; offset: number },
	) {
		const rows = await this.accessibleForUser(userId)
			.selectAll("facilities")
			.orderBy("facilities.updated_at", "desc")
			.orderBy("facilities.id", "asc")
			.limit(input.limit)
			.offset(input.offset)
			.execute();
		const totalResult = await this.accessibleForUser(userId)
			.select((eb) => eb.fn.countAll<number>().as("total"))
			.executeTakeFirstOrThrow();
		const total = Number(totalResult.total);
		return { rows, total, hasMore: input.offset + rows.length < total };
	}

	async findAccessibleForUserAndFacility(userId: string, facilityId: string) {
		return this.accessibleForUser(userId)
			.selectAll("facilities")
			.where("facilities.id", "=", facilityId)
			.executeTakeFirst();
	}

	async updateManagerListingFields(
		input: PartnerUpdateFacilityListingFieldsInput,
	) {
		const row = await this.updateFacilityWithVersion(
			input.facilityId,
			input.expectedVersion,
			{
				...input.patch,
				updated_at: input.updatedAt,
			},
		);
		return row;
	}

	async updateAvailability(input: PartnerUpdateFacilityAvailabilityInput) {
		return this.updateFacilityWithVersion(
			input.facilityId,
			input.expectedVersion,
			{
				availability_status: input.status,
				beds_available: input.bedsAvailable,
				availability_note: input.note,
				availability_updated_at: input.updatedAt,
				updated_at: input.updatedAt,
			},
		);
	}

	async updateTourAvailability(input: PartnerUpdateFacilityTourAvailabilityInput) {
		return this.updateFacilityWithVersion(
			input.facilityId,
			input.expectedVersion,
			{
				tour_availability: input.tourAvailability,
				tour_availability_updated_at: input.updatedAt,
				updated_at: input.updatedAt,
			},
		);
	}

	private accessibleForUser(userId: string) {
		return this.db
			.selectFrom("facilities")
			.innerJoin("companies", "companies.id", "facilities.company_id")
			.innerJoin("company_users", "company_users.company_id", "companies.id")
			.where("company_users.user_id", "=", userId)
			.where("company_users.status", "=", "active")
			.where("companies.status", "=", "active");
	}

	private async updateFacilityWithVersion(
		facilityId: string,
		expectedVersion: number | undefined,
		patch: Partial<FacilityRow>,
	) {
		const current = await this.db
			.selectFrom("facilities")
			.select(["id", "version"])
			.where("id", "=", facilityId)
			.executeTakeFirst();
		if (!current) {
			throw new ApiError("facility_not_found", "Facility was not found.", 404, {
				facilityId,
			});
		}
		if (expectedVersion !== undefined && current.version !== expectedVersion) {
			throw versionConflict({
				facilityId,
				expectedVersion,
				currentVersion: current.version,
			});
		}

		let query = this.db
			.updateTable("facilities")
			.set({
				...patch,
				version: current.version + 1,
			} as never)
			.where("id", "=", facilityId);
		if (expectedVersion !== undefined) {
			query = query.where("version", "=", expectedVersion);
		}
		const updated = await query.returningAll().executeTakeFirst();
		if (!updated) {
			throw versionConflict({
				facilityId,
				expectedVersion,
				currentVersion: current.version,
			});
		}
		return updated;
	}
}

export class KyselySavedFacilityRepository {
	constructor(private readonly db: DbExecutor) {}

	async create(
		userId: string,
		facilityId: string,
	): Promise<SavedFacilityRecord> {
		const existing = await this.db
			.selectFrom("saved_facilities")
			.selectAll()
			.where("user_id", "=", userId)
			.where("facility_id", "=", facilityId)
			.executeTakeFirst();

		if (existing) {
			return existing;
		}

		const id = `save_${crypto.randomUUID()}`;
		const created = await this.db
			.insertInto("saved_facilities")
			.values({
				id,
				user_id: userId,
				facility_id: facilityId,
				created_at: new Date(),
			})
			.returningAll()
			.executeTakeFirstOrThrow();

		return created;
	}

	async listForUser(userId: string) {
		return this.db
			.selectFrom("saved_facilities")
			.selectAll()
			.where("user_id", "=", userId)
			.orderBy("created_at", "desc")
			.execute();
	}

	async delete(userId: string, facilityId: string) {
		await this.db
			.deleteFrom("saved_facilities")
			.where("user_id", "=", userId)
			.where("facility_id", "=", facilityId)
			.execute();
		return { id: facilityId };
	}

	async savedFacilityIdsForUser(userId: string | null) {
		if (!userId) {
			return new Set<string>();
		}
		const rows = await this.listForUser(userId);
		return new Set(rows.map((save) => save.facility_id));
	}
}

export class KyselyTourRepository {
	constructor(private readonly db: DbExecutor) {}

	async create(row: TourRequestRow) {
		await this.db
			.insertInto("tour_requests")
			.values(row as never)
			.execute();
		return row;
	}

	async listForUser(userId: string) {
		return this.db
			.selectFrom("tour_requests")
			.selectAll()
			.where("user_id", "=", userId)
			.orderBy("created_at", "desc")
			.execute();
	}

	async countForUser(userId: string) {
		const result = await this.db
			.selectFrom("tour_requests")
			.select((eb) => eb.fn.countAll<number>().as("total"))
			.where("user_id", "=", userId)
			.executeTakeFirstOrThrow();
		return Number(result.total);
	}

	async listForFacility(input: PartnerListFacilityTourRequestsInput) {
		let query = this.db
			.selectFrom("tour_requests")
			.selectAll()
			.where("facility_id", "=", input.facilityId)
			.orderBy("created_at", "desc")
			.orderBy("id", "asc")
			.limit(input.limit)
			.offset(input.offset);
		if (input.statuses?.length) {
			query = query.where("status", "in", input.statuses);
		}

		let countQuery = this.db
			.selectFrom("tour_requests")
			.select((eb) => eb.fn.countAll<number>().as("total"))
			.where("facility_id", "=", input.facilityId);
		if (input.statuses?.length) {
			countQuery = countQuery.where("status", "in", input.statuses);
		}

		const [rows, totalResult] = await Promise.all([
			query.execute(),
			countQuery.executeTakeFirstOrThrow(),
		]);
		const total = Number(totalResult.total);
		return { rows, total, hasMore: input.offset + rows.length < total };
	}

	async findForFacility(input: PartnerFindFacilityTourRequestInput) {
		return this.db
			.selectFrom("tour_requests")
			.selectAll()
			.where("id", "=", input.tourRequestId)
			.where("facility_id", "=", input.facilityId)
			.executeTakeFirst();
	}

	async updateStatus(input: PartnerUpdateTourRequestStatusInput) {
		const current = await this.findForFacility(input);
		if (!current) {
			throw new ApiError("not_found", "Tour request was not found.", 404, {
				facilityId: input.facilityId,
				tourRequestId: input.tourRequestId,
			});
		}
		if (input.expectedVersion !== undefined && current.version !== input.expectedVersion) {
			throw versionConflict({
				tourRequestId: input.tourRequestId,
				expectedVersion: input.expectedVersion,
				currentVersion: current.version,
			});
		}

		let query = this.db
			.updateTable("tour_requests")
			.set({
				status: input.status,
				version: current.version + 1,
				updated_at: input.updatedAt,
				...(input.scheduledDate !== undefined
					? { scheduled_date: input.scheduledDate }
					: {}),
				...(input.scheduledTime !== undefined
					? { scheduled_time: input.scheduledTime }
					: {}),
				...(input.partnerMessage !== undefined
					? { partner_message: input.partnerMessage }
					: {}),
			})
			.where("id", "=", input.tourRequestId)
			.where("facility_id", "=", input.facilityId);
		if (input.expectedVersion !== undefined) {
			query = query.where("version", "=", input.expectedVersion);
		}
		const updated = await query.returningAll().executeTakeFirst();
		if (!updated) {
			throw versionConflict({
				tourRequestId: input.tourRequestId,
				expectedVersion: input.expectedVersion,
				currentVersion: current.version,
			});
		}
		return updated;
	}

	async summarizeForFacility(facilityId: string): Promise<PartnerTourSummary> {
		const summary: PartnerTourSummary = {
			pending_review: 0,
			confirmed: 0,
			attended: 0,
			no_show: 0,
			declined: 0,
			cancelled: 0,
		};
		const rows = await this.db
			.selectFrom("tour_requests")
			.select(["status"])
			.select((eb) => eb.fn.countAll<number>().as("total"))
			.where("facility_id", "=", facilityId)
			.groupBy("status")
			.execute();
		for (const row of rows) {
			summary[row.status] = Number(row.total);
		}
		return summary;
	}
}

export class KyselyReviewRepository {
	constructor(private readonly db: DbExecutor) {}

	async listPublishedForFacility(
		facilityId: string,
		limit: number,
		offset: number,
	) {
		const rows = await this.db
			.selectFrom("reviews")
			.selectAll()
			.where("facility_id", "=", facilityId)
			.where("status", "=", "published")
			.orderBy("review_date", "desc")
			.limit(limit)
			.offset(offset)
			.execute();

		const totalResult = await this.db
			.selectFrom("reviews")
			.select((eb) => eb.fn.countAll<number>().as("total"))
			.where("facility_id", "=", facilityId)
			.where("status", "=", "published")
			.executeTakeFirstOrThrow();
		const total = Number(totalResult.total);

		return { rows, total, hasMore: offset + limit < total };
	}

	async allPublished() {
		return this.db
			.selectFrom("reviews")
			.selectAll()
			.where("status", "=", "published")
			.execute();
	}

	async listForFacilityForPartner(input: PartnerListFacilityReviewsInput) {
		let query = this.db
			.selectFrom("reviews")
			.selectAll()
			.where("facility_id", "=", input.facilityId)
			.orderBy("review_date", "desc")
			.orderBy("created_at", "desc")
			.orderBy("id", "asc")
			.limit(input.limit)
			.offset(input.offset);
		if (input.statuses?.length) {
			query = query.where("status", "in", input.statuses);
		}

		let countQuery = this.db
			.selectFrom("reviews")
			.select((eb) => eb.fn.countAll<number>().as("total"))
			.where("facility_id", "=", input.facilityId);
		if (input.statuses?.length) {
			countQuery = countQuery.where("status", "in", input.statuses);
		}

		const [rows, totalResult] = await Promise.all([
			query.execute(),
			countQuery.executeTakeFirstOrThrow(),
		]);
		const total = Number(totalResult.total);
		return { rows, total, hasMore: input.offset + rows.length < total };
	}

	async findForFacility(input: PartnerFindFacilityReviewInput) {
		return this.db
			.selectFrom("reviews")
			.selectAll()
			.where("id", "=", input.reviewId)
			.where("facility_id", "=", input.facilityId)
			.executeTakeFirst();
	}

	async findResponseForReview(reviewId: string) {
		return this.db
			.selectFrom("review_responses")
			.selectAll()
			.where("review_id", "=", reviewId)
			.executeTakeFirst();
	}

	async listResponsesForReviews(reviewIds: string[]) {
		if (reviewIds.length === 0) {
			return [];
		}
		return this.db
			.selectFrom("review_responses")
			.selectAll()
			.where("review_id", "in", reviewIds)
			.execute();
	}

	async createResponse(
		input: PartnerCreateReviewResponseInput,
	): Promise<ReviewResponseRow> {
		await this.assertReviewExists(input);
		if (await this.findResponseForReview(input.reviewId)) {
			throw new ApiError("conflict", "Review response already exists.", 409, {
				reviewId: input.reviewId,
			});
		}

		try {
			return await this.db
				.insertInto("review_responses")
				.values({
					id: generatedId("rresp"),
					review_id: input.reviewId,
					facility_id: input.facilityId,
					responder_user_id: input.responderUserId,
					body: input.body,
					status: "published",
					version: 1,
					created_at: input.now,
					updated_at: input.now,
				})
				.returningAll()
				.executeTakeFirstOrThrow();
		} catch (error) {
			if (isUniqueViolation(error)) {
				throw new ApiError("conflict", "Review response already exists.", 409, {
					reviewId: input.reviewId,
				});
			}
			throw error;
		}
	}

	async updateResponse(
		input: PartnerUpdateReviewResponseInput,
	): Promise<ReviewResponseRow> {
		await this.assertReviewExists(input);
		const current = await this.db
			.selectFrom("review_responses")
			.selectAll()
			.where("review_id", "=", input.reviewId)
			.where("facility_id", "=", input.facilityId)
			.executeTakeFirst();
		if (!current) {
			throw new ApiError("not_found", "Review response was not found.", 404, {
				reviewId: input.reviewId,
			});
		}
		if (input.expectedVersion !== undefined && current.version !== input.expectedVersion) {
			throw versionConflict({
				reviewId: input.reviewId,
				expectedVersion: input.expectedVersion,
				currentVersion: current.version,
			});
		}

		let query = this.db
			.updateTable("review_responses")
			.set({
				body: input.body,
				responder_user_id: input.responderUserId,
				version: current.version + 1,
				updated_at: input.now,
			})
			.where("review_id", "=", input.reviewId)
			.where("facility_id", "=", input.facilityId);
		if (input.expectedVersion !== undefined) {
			query = query.where("version", "=", input.expectedVersion);
		}
		const updated = await query.returningAll().executeTakeFirst();
		if (!updated) {
			throw versionConflict({
				reviewId: input.reviewId,
				expectedVersion: input.expectedVersion,
				currentVersion: current.version,
			});
		}
		return updated;
	}

	async createFlag(input: PartnerCreateReviewFlagInput): Promise<ReviewFlagRow> {
		await this.assertReviewExists(input);
		const duplicate = await this.db
			.selectFrom("review_flags")
			.select("id")
			.where("review_id", "=", input.reviewId)
			.where("flagged_by_user_id", "=", input.flaggedByUserId)
			.where("status", "=", "pending")
			.executeTakeFirst();
		if (duplicate) {
			throw new ApiError("conflict", "Review already has a pending flag.", 409, {
				reviewId: input.reviewId,
			});
		}

		try {
			return await this.db
				.insertInto("review_flags")
				.values({
					id: generatedId("rflag"),
					review_id: input.reviewId,
					facility_id: input.facilityId,
					flagged_by_user_id: input.flaggedByUserId,
					reason: input.reason,
					details: input.details,
					status: "pending",
					resolver_user_id: null,
					resolution_note: null,
					resolved_at: null,
					created_at: input.now,
					updated_at: input.now,
				})
				.returningAll()
				.executeTakeFirstOrThrow();
		} catch (error) {
			if (isUniqueViolation(error)) {
				throw new ApiError("conflict", "Review already has a pending flag.", 409, {
					reviewId: input.reviewId,
				});
			}
			throw error;
		}
	}

	async listPendingFlagsForReviews(reviewIds: string[]) {
		if (reviewIds.length === 0) {
			return [];
		}
		return this.db
			.selectFrom("review_flags")
			.selectAll()
			.where("review_id", "in", reviewIds)
			.where("status", "=", "pending")
			.orderBy("created_at", "desc")
			.orderBy("id", "asc")
			.execute();
	}

	private async assertReviewExists(input: PartnerFindFacilityReviewInput) {
		if (await this.findForFacility(input)) {
			return;
		}
		throw new ApiError("not_found", "Review was not found.", 404, {
			facilityId: input.facilityId,
			reviewId: input.reviewId,
		});
	}
}

export class KyselyAuditRepository {
	constructor(private readonly db: DbExecutor) {}

	async write(row: AuditRecord) {
		await this.db
			.insertInto("audit_events")
			.values(row as never)
			.execute();
		return row;
	}

	async listForResource(input: PartnerListAuditEventsInput) {
		let query = this.db
			.selectFrom("audit_events")
			.selectAll()
			.where("resource_type", "=", input.resourceType)
			.where("resource_id", "=", input.resourceId)
			.orderBy("created_at", "desc")
			.orderBy("id", "asc")
			.limit(input.limit)
			.offset(input.offset);
		if (input.actions?.length) {
			query = query.where("action", "in", input.actions);
		}

		let countQuery = this.db
			.selectFrom("audit_events")
			.select((eb) => eb.fn.countAll<number>().as("total"))
			.where("resource_type", "=", input.resourceType)
			.where("resource_id", "=", input.resourceId);
		if (input.actions?.length) {
			countQuery = countQuery.where("action", "in", input.actions);
		}

		const [rows, totalResult] = await Promise.all([
			query.execute(),
			countQuery.executeTakeFirstOrThrow(),
		]);
		const total = Number(totalResult.total);
		return { rows, total, hasMore: input.offset + rows.length < total };
	}
}

export class KyselyOutboxRepository {
	constructor(private readonly db: DbExecutor) {}

	async write(row: OutboxRecord) {
		await this.db
			.insertInto("outbox_events")
			.values({
				...row,
				next_attempt_at: null,
				updated_at: row.created_at,
			} as never)
			.execute();
		return row;
	}
}

export class KyselyIdempotencyRepository implements IdempotencyRepositoryPort {
	constructor(private readonly db: DbExecutor) {}

	async find(key: string, userId: string | null, now = new Date()) {
		return this.db
			.selectFrom("idempotency_keys")
			.selectAll()
			.where("key", "=", key)
			.where("user_id", userId === null ? "is" : "=", userId)
			.where("expires_at", ">", now)
			.executeTakeFirst();
	}

	async create(
		row: import("@/db/repositories/inMemoryStore").IdempotencyRecord,
	) {
		await this.db
			.insertInto("idempotency_keys")
			.values(row as never)
			.execute();
		return row;
	}
}

export class KyselyAssessmentRepository {
	constructor(private readonly db: DbExecutor) {}

	async create(
		input: import("./assessmentRepository").CreateAssessmentResultInput,
	) {
		if (input.user_id) {
			await this.db
				.updateTable("assessment_results")
				.set({ is_latest: false })
				.where("user_id", "=", input.user_id)
				.where("is_latest", "=", true)
				.execute();
		} else if (input.owner_session_id) {
			await this.db
				.updateTable("assessment_results")
				.set({ is_latest: false })
				.where("owner_session_id", "=", input.owner_session_id)
				.where("user_id", "is", null)
				.where("is_latest", "=", true)
				.execute();
		}

		await this.db
			.insertInto("assessment_results")
			.values(input as never)
			.execute();
		return this.findById(input.id) as Promise<
			import("@/db/schema/assessmentTypes").AssessmentResultRow
		>;
	}

	async findLatestForOwner(input: {
		user_id: string | null;
		owner_session_id: string | null;
	}) {
		let query = this.db
			.selectFrom("assessment_results")
			.selectAll()
			.where("is_latest", "=", true);
		if (input.user_id) {
			query = query.where("user_id", "=", input.user_id);
		} else if (input.owner_session_id) {
			query = query
				.where("user_id", "is", null)
				.where("owner_session_id", "=", input.owner_session_id);
		} else {
			return undefined;
		}
		return query.executeTakeFirst();
	}

	async findById(id: string) {
		return this.db
			.selectFrom("assessment_results")
			.selectAll()
			.where("id", "=", id)
			.executeTakeFirst();
	}

	async deleteLatestForOwner(
		input: import("./assessmentRepository").AssessmentOwnerScope,
	) {
		const row = await this.findLatestForOwner(input);
		if (!row) return null;
		await this.db
			.updateTable("assessment_results")
			.set({ is_latest: false })
			.where("id", "=", row.id)
			.execute();
		return { id: row.id };
	}

	async claimAnonymousSession(
		anonymousSessionId: string,
		userId: string,
		sessionId: string | null,
	) {
		const row = await this.db
			.selectFrom("assessment_results")
			.selectAll()
			.where("is_latest", "=", true)
			.where("user_id", "is", null)
			.where("owner_session_id", "=", anonymousSessionId)
			.executeTakeFirst();
		if (!row) return false;

		await this.db
			.updateTable("assessment_results")
			.set({ is_latest: false })
			.where("user_id", "=", userId)
			.where("is_latest", "=", true)
			.execute();

		await this.db
			.updateTable("assessment_results")
			.set({ user_id: userId, owner_session_id: sessionId, is_latest: true })
			.where("id", "=", row.id)
			.execute();
		return true;
	}
}

const emptyArticleRepository = {
	async listPublished(limit: number, offset: number) {
		return { rows: [], total: 0, hasMore: false as boolean };
	},
	async getPublished(idOrSlug: string): Promise<never> {
		throw new ApiError("article_not_found", "Article was not found.", 404, {
			id: idOrSlug,
		});
	},
};

export function createKyselyRepositories(db: DbExecutor): Repositories {
	return {
		audit: new KyselyAuditRepository(db),
		companies: new KyselyCompanyRepository(db),
		companyUsers: new KyselyCompanyUserRepository(db),
		facilities: new KyselyFacilityRepository(db),
		idempotency: new KyselyIdempotencyRepository(db),
		outbox: new KyselyOutboxRepository(db),
		partnerFacilities: new KyselyPartnerFacilityRepository(db),
		references: new KyselyReferenceRepository(db),
		reviews: new KyselyReviewRepository(db),
		savedFacilities: new KyselySavedFacilityRepository(db),
		sessions: new KyselySessionRepository(db),
		tours: new KyselyTourRepository(db),
		users: new KyselyUserRepository(db),
		articles: emptyArticleRepository,
		assessments: new KyselyAssessmentRepository(db),
	};
}
