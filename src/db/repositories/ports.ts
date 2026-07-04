import type { IdempotencyRecord } from "@/db/repositories/inMemoryStore";
import type { AssessmentResultRow } from "@/db/schema/assessmentTypes";
import type {
  ArticleRow,
  CompanyRow,
  CompanyUserRow,
  FacilityRow,
  ReferenceItemRow,
  ReviewRow,
  SessionRow,
  TourRequestRow,
  UserRow,
} from "@/db/schema/types";
import type { ActorRole } from "@/shared/request-context/context";
import type { SessionAudience } from "@/shared/authz/sessionAudience";
import type { CreateAssessmentResultInput, AssessmentOwnerScope } from "./assessmentRepository";
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

export interface FacilityRepositoryPort {
  listPublic(input: FacilitySearchInput): Promise<{ rows: FacilityRow[]; total: number; hasMore: boolean }>;
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
  updateProfile(userId: string, patch: { display_name?: string }): Promise<UserRow>;
  rolesForUser(userId: string): Promise<ActorRole[]>;
}

export interface SessionRepositoryPort {
  create(session: SessionRow): Promise<SessionRow>;
  findActiveByTokenHash(tokenHash: string, audience: SessionAudience, now?: Date): Promise<SessionRow | undefined>;
  revoke(sessionId: string, now?: Date): Promise<void>;
}

export interface CompanyRepositoryPort {
  findById(id: string): Promise<CompanyRow | undefined>;
  listActiveForUser(userId: string): Promise<CompanyRow[]>;
}

export interface CompanyUserRepositoryPort {
  listActiveForUser(userId: string): Promise<CompanyUserRow[]>;
  findActiveMembership(userId: string, companyId: string): Promise<CompanyUserRow | undefined>;
  countActiveCompanies(userId: string): Promise<number>;
}

export interface PartnerFacilityRepositoryPort {
  listAccessibleForUser(
    userId: string,
    input: { limit: number; offset: number },
  ): Promise<{ rows: FacilityRow[]; total: number; hasMore: boolean }>;
  findAccessibleForUserAndFacility(userId: string, facilityId: string): Promise<FacilityRow | undefined>;
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
}

export interface ArticleRepositoryPort {
  listPublished(limit: number, offset: number): Promise<{ rows: ArticleRow[]; total: number; hasMore: boolean }>;
  getPublished(idOrSlug: string): Promise<ArticleRow>;
}

export interface AuditRepositoryPort {
  write(event: AuditRecord): Promise<AuditRecord>;
}

export interface OutboxRepositoryPort {
  write(event: OutboxRecord): Promise<OutboxRecord>;
}

export interface AssessmentRepositoryPort {
  create(input: CreateAssessmentResultInput): Promise<AssessmentResultRow>;
  findLatestForOwner(input: AssessmentOwnerScope): Promise<AssessmentResultRow | undefined>;
  findById(id: string): Promise<AssessmentResultRow | undefined>;
  deleteLatestForOwner(input: AssessmentOwnerScope): Promise<{ id: string } | null>;
  claimAnonymousSession(anonymousSessionId: string, userId: string, sessionId: string | null): Promise<boolean>;
}

export interface IdempotencyRepositoryPort {
  find(key: string, userId: string | null, now?: Date): Promise<IdempotencyRecord | undefined>;
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
