import type { IdempotencyRecord } from "@/db/repositories/inMemoryStore";
import type { AssessmentResultRow } from "@/db/schema/assessmentTypes";
import type {
	ArticleRow,
	AuditEventRow,
	CompanyRow,
	CompanyUserRow,
	FacilityRow,
	ReviewFlagRow,
	ReviewResponseRow,
	ReviewRow,
	SessionRow,
	TourRequestRow,
	UserRow,
} from "@/db/schema/types";
import type { SessionAudience } from "@/shared/authz/sessionAudience";
import type { ActorRole } from "@/shared/request-context/context";
import type {
	AssessmentOwnerScope,
	CreateAssessmentResultInput,
} from "./assessmentRepository";
import type { FacilitySearchInput } from "./facilityRepository";

export interface SavedFacilityRecord {
	id: string;
	user_id: string;
	facility_id: string;
	created_at: Date;
}

export interface AuditRecord {
	id: string;
	actor_user_id: string | null;
	action: string;
	resource_type: string;
	resource_id: string;
	metadata: unknown;
	created_at: Date;
}

export interface OutboxRecord {
	id: string;
	event_type: string;
	aggregate_type: string;
	aggregate_id: string;
	payload: unknown;
	status: "pending" | "sent" | "failed";
	attempts: number;
	created_at: Date;
}

export interface PartnerPageInput {
	limit: number;
	offset: number;
}

export interface PartnerFacilityListingPatch {
	tagline?: string;
	about?: string;
	highlights?: string[];
	right_for_you_if?: string[];
	features?: string[];
	languages?: string[];
}

export interface PartnerUpdateFacilityListingFieldsInput {
	facilityId: string;
	expectedVersion?: number;
	patch: PartnerFacilityListingPatch;
	updatedAt: Date;
}

export interface PartnerUpdateFacilityAvailabilityInput {
	facilityId: string;
	expectedVersion?: number;
	status: FacilityRow["availability_status"];
	bedsAvailable: number | null;
	note: string | null;
	updatedAt: Date;
}

export interface PartnerUpdateFacilityTourAvailabilityInput {
	facilityId: string;
	expectedVersion?: number;
	tourAvailability: unknown;
	updatedAt: Date;
}

export interface PartnerListFacilityTourRequestsInput extends PartnerPageInput {
	facilityId: string;
	statuses?: TourRequestRow["status"][];
}

export interface PartnerFindFacilityTourRequestInput {
	facilityId: string;
	tourRequestId: string;
}

export interface PartnerUpdateTourRequestStatusInput
	extends PartnerFindFacilityTourRequestInput {
	status: TourRequestRow["status"];
	expectedVersion?: number;
	updatedAt: Date;
	scheduledDate?: string;
	scheduledTime?: string;
	partnerMessage?: string | null;
}

export interface PartnerTourSummary {
	pending_review: number;
	confirmed: number;
	attended: number;
	no_show: number;
	declined: number;
	cancelled: number;
}

export interface PartnerListFacilityReviewsInput extends PartnerPageInput {
	facilityId: string;
	statuses?: ReviewRow["status"][];
}

export interface PartnerFindFacilityReviewInput {
	facilityId: string;
	reviewId: string;
}

export interface PartnerCreateReviewResponseInput
	extends PartnerFindFacilityReviewInput {
	responderUserId: string;
	body: string;
	now: Date;
}

export interface PartnerUpdateReviewResponseInput
	extends PartnerFindFacilityReviewInput {
	responderUserId: string;
	body: string;
	expectedVersion?: number;
	now: Date;
}

export interface PartnerCreateReviewFlagInput
	extends PartnerFindFacilityReviewInput {
	flaggedByUserId: string;
	reason: ReviewFlagRow["reason"];
	details: string | null;
	now: Date;
}

export interface PartnerListAuditEventsInput extends PartnerPageInput {
	resourceType: string;
	resourceId: string;
	actions?: string[];
}

export interface FacilityRepositoryPort {
	listPublic(
		input: FacilitySearchInput,
	): Promise<{ rows: FacilityRow[]; total: number; hasMore: boolean }>;
	findPublicById(idOrSlug: string): Promise<FacilityRow>;
	listPublicByIds(ids: Set<string>): Promise<FacilityRow[]>;
}

export interface ReviewRepositoryPort {
	listPublishedForFacility(
		facilityId: string,
		limit: number,
		offset: number,
	): Promise<{ rows: ReviewRow[]; total: number; hasMore: boolean }>;
	allPublished(): Promise<ReviewRow[]>;
	listForFacilityForPartner(
		input: PartnerListFacilityReviewsInput,
	): Promise<{ rows: ReviewRow[]; total: number; hasMore: boolean }>;
	findForFacility(
		input: PartnerFindFacilityReviewInput,
	): Promise<ReviewRow | undefined>;
	findResponseForReview(
		reviewId: string,
	): Promise<ReviewResponseRow | undefined>;
	listResponsesForReviews(reviewIds: string[]): Promise<ReviewResponseRow[]>;
	createResponse(
		input: PartnerCreateReviewResponseInput,
	): Promise<ReviewResponseRow>;
	updateResponse(
		input: PartnerUpdateReviewResponseInput,
	): Promise<ReviewResponseRow>;
	createFlag(input: PartnerCreateReviewFlagInput): Promise<ReviewFlagRow>;
	listPendingFlagsForReviews(reviewIds: string[]): Promise<ReviewFlagRow[]>;
}

export interface ReferenceRepositoryPort {
	getSearchOptions(): Promise<{
		care_types: Array<{ id: string; name: string }>;
		regions: Array<{ id: string; name: string }>;
		features: Array<{ id: string; name: string }>;
		languages: Array<{ id: string; name: string }>;
		price_range: { min: number; max: number; currency: string };
	}>;
}

export interface UserRepositoryPort {
	findByEmail(email: string): Promise<UserRow | undefined>;
	findById(id: string): Promise<UserRow | undefined>;
	findByAuthUserId(authUserId: string): Promise<UserRow | undefined>;
	linkAuthUserId(
		userId: string,
		authUserId: string,
		patch?: { display_name?: string },
	): Promise<UserRow>;
	createFromAuthIdentity(input: {
		auth_user_id: string;
		email: string;
		display_name: string;
		status: UserRow["status"];
	}): Promise<UserRow>;
	updateProfile(
		userId: string,
		patch: { display_name?: string },
	): Promise<UserRow>;
	rolesForUser(userId: string): Promise<ActorRole[]>;
}

export interface SessionRepositoryPort {
	create(session: SessionRow): Promise<SessionRow>;
	findActiveByTokenHash(
		tokenHash: string,
		audience: SessionAudience,
		now?: Date,
	): Promise<SessionRow | undefined>;
	revoke(sessionId: string, now?: Date): Promise<void>;
}

export interface CompanyRepositoryPort {
	findById(id: string): Promise<CompanyRow | undefined>;
	listActiveForUser(userId: string): Promise<CompanyRow[]>;
}

export interface CompanyUserRepositoryPort {
	listActiveForUser(userId: string): Promise<CompanyUserRow[]>;
	findActiveMembership(
		userId: string,
		companyId: string,
	): Promise<CompanyUserRow | undefined>;
	countActiveCompanies(userId: string): Promise<number>;
}

export interface PartnerFacilityRepositoryPort {
	listAccessibleForUser(
		userId: string,
		input: { limit: number; offset: number },
	): Promise<{ rows: FacilityRow[]; total: number; hasMore: boolean }>;
	findAccessibleForUserAndFacility(
		userId: string,
		facilityId: string,
	): Promise<FacilityRow | undefined>;
	updateManagerListingFields(
		input: PartnerUpdateFacilityListingFieldsInput,
	): Promise<FacilityRow>;
	updateAvailability(
		input: PartnerUpdateFacilityAvailabilityInput,
	): Promise<FacilityRow>;
	updateTourAvailability(
		input: PartnerUpdateFacilityTourAvailabilityInput,
	): Promise<FacilityRow>;
}

export interface SavedFacilityRepositoryPort {
	listForUser(userId: string): Promise<SavedFacilityRecord[]>;
	create(userId: string, facilityId: string): Promise<SavedFacilityRecord>;
	delete(userId: string, facilityId: string): Promise<{ id: string }>;
	savedFacilityIdsForUser(userId: string | null): Promise<Set<string>>;
}

export interface TourRepositoryPort {
	create(row: TourRequestRow): Promise<TourRequestRow>;
	listForUser(userId: string): Promise<TourRequestRow[]>;
	countForUser(userId: string): Promise<number>;
	listForFacility(input: PartnerListFacilityTourRequestsInput): Promise<{
		rows: TourRequestRow[];
		total: number;
		hasMore: boolean;
	}>;
	findForFacility(
		input: PartnerFindFacilityTourRequestInput,
	): Promise<TourRequestRow | undefined>;
	updateStatus(
		input: PartnerUpdateTourRequestStatusInput,
	): Promise<TourRequestRow>;
	summarizeForFacility(facilityId: string): Promise<PartnerTourSummary>;
}

export interface ArticleRepositoryPort {
	listPublished(
		limit: number,
		offset: number,
	): Promise<{ rows: ArticleRow[]; total: number; hasMore: boolean }>;
	getPublished(idOrSlug: string): Promise<ArticleRow>;
}

export interface AuditRepositoryPort {
	write(event: AuditRecord): Promise<AuditRecord>;
	listForResource(input: PartnerListAuditEventsInput): Promise<{
		rows: AuditEventRow[];
		total: number;
		hasMore: boolean;
	}>;
}

export interface OutboxRepositoryPort {
	write(event: OutboxRecord): Promise<OutboxRecord>;
}

export interface AssessmentRepositoryPort {
	create(input: CreateAssessmentResultInput): Promise<AssessmentResultRow>;
	findLatestForOwner(
		input: AssessmentOwnerScope,
	): Promise<AssessmentResultRow | undefined>;
	findById(id: string): Promise<AssessmentResultRow | undefined>;
	deleteLatestForOwner(
		input: AssessmentOwnerScope,
	): Promise<{ id: string } | null>;
	claimAnonymousSession(
		anonymousSessionId: string,
		userId: string,
		sessionId: string | null,
	): Promise<boolean>;
}

export interface IdempotencyRepositoryPort {
	find(
		key: string,
		userId: string | null,
		now?: Date,
	): Promise<IdempotencyRecord | undefined>;
	create(record: IdempotencyRecord): Promise<IdempotencyRecord>;
}

export interface Repositories {
	companies: CompanyRepositoryPort;
	companyUsers: CompanyUserRepositoryPort;
	facilities: FacilityRepositoryPort;
	partnerFacilities: PartnerFacilityRepositoryPort;
	reviews: ReviewRepositoryPort;
	references: ReferenceRepositoryPort;
	users: UserRepositoryPort;
	sessions: SessionRepositoryPort;
	savedFacilities: SavedFacilityRepositoryPort;
	tours: TourRepositoryPort;
	articles: ArticleRepositoryPort;
	assessments: AssessmentRepositoryPort;
	audit: AuditRepositoryPort;
	outbox: OutboxRepositoryPort;
	idempotency: IdempotencyRepositoryPort;
}
