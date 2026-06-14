import type { ColumnType, Generated, Insertable, Selectable, Updateable } from "kysely";

export type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

export interface UsersTable {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  status: "active" | "disabled";
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SessionsTable {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Timestamp;
  created_at: Timestamp;
  revoked_at: Timestamp | null;
}

export interface FacilitiesTable {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  status: "draft" | "approved" | "rejected" | "disabled" | "removed";
  is_enabled: boolean;
  care_types: string[];
  region_id: string;
  district: string;
  address: string;
  postal_code: string;
  price_from: number;
  price_unit: "month" | "day";
  rating: number;
  review_count: number;
  image_url: string;
  gallery_urls: string[];
  features: string[];
  languages: string[];
  capacity: number | null;
  year_opened: number | null;
  licence: string | null;
  about: string;
  highlights: string[];
  right_for_you_if: string[];
  latitude: number | null;
  longitude: number | null;
  availability_status: "available" | "limited" | "waitlist" | "unavailable" | "full";
  beds_available: number | null;
  availability_note: string | null;
  availability_updated_at: Timestamp | null;
  provider_contact_email: string | null;
  admin_notes: string | null;
  moderation_state: string | null;
  version: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface RolesTable {
  id: string;
  name: string;
  description: string;
  created_at: Timestamp;
}

export interface UserRolesTable {
  user_id: string;
  role_id: string;
  created_at: Timestamp;
}

export interface FacilityMembershipsTable {
  id: Generated<string>;
  facility_id: string;
  user_id: string;
  role: "owner" | "manager" | "staff";
  status: "active" | "disabled";
  created_at: Timestamp;
}

export interface ListingSubmissionsTable {
  id: Generated<string>;
  facility_id: string | null;
  submitter_user_id: string | null;
  status: "draft" | "submitted" | "approved" | "rejected" | "withdrawn";
  payload: unknown;
  version: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ReviewsTable {
  id: string;
  facility_id: string;
  author_name: string;
  relationship: string;
  rating: number;
  title: string;
  body: string;
  review_date: string;
  verified: boolean;
  status: "published" | "hidden";
  version: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SavedFacilitiesTable {
  id: Generated<string>;
  user_id: string;
  facility_id: string;
  created_at: Timestamp;
}

export interface TourRequestsTable {
  id: string;
  user_id: string;
  facility_id: string;
  status: "pending_review" | "confirmed" | "declined" | "attended" | "no_show" | "cancelled";
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  preferred_date: string;
  preferred_time: string;
  care_notes: string | null;
  version: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface AuditEventsTable {
  id: string;
  actor_user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  metadata: unknown;
  created_at: Timestamp;
}

export interface OutboxEventsTable {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: unknown;
  status: "pending" | "sent" | "failed";
  attempts: number;
  next_attempt_at: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface IdempotencyKeysTable {
  key: string;
  user_id: string | null;
  request_hash: string;
  response_status: number;
  response_body: unknown;
  expires_at: Timestamp;
  created_at: Timestamp;
}

export interface ReferenceItemsTable {
  id: string;
  kind: "care_type" | "feature" | "language" | "region";
  name: string;
  metadata: unknown;
  sort_order: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ArticlesTable {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  category: string;
  status: "published" | "draft";
  published_at: Timestamp;
}

export interface Database {
  users: UsersTable;
  sessions: SessionsTable;
  roles: RolesTable;
  user_roles: UserRolesTable;
  facilities: FacilitiesTable;
  facility_memberships: FacilityMembershipsTable;
  listing_submissions: ListingSubmissionsTable;
  reviews: ReviewsTable;
  saved_facilities: SavedFacilitiesTable;
  tour_requests: TourRequestsTable;
  audit_events: AuditEventsTable;
  outbox_events: OutboxEventsTable;
  idempotency_keys: IdempotencyKeysTable;
  reference_items: ReferenceItemsTable;
  articles: ArticlesTable;
}

export type FacilityRow = Selectable<FacilitiesTable>;
export type NewFacilityRow = Insertable<FacilitiesTable>;
export type FacilityUpdate = Updateable<FacilitiesTable>;
export type ReviewRow = Selectable<ReviewsTable>;
export type NewReviewRow = Insertable<ReviewsTable>;
export type UserRow = Selectable<UsersTable>;
export type SessionRow = Selectable<SessionsTable>;
export type TourRequestRow = Selectable<TourRequestsTable>;
export type NewTourRequestRow = Insertable<TourRequestsTable>;
export type ArticleRow = Selectable<ArticlesTable>;
export type ReferenceItemRow = Selectable<ReferenceItemsTable>;
export type SavedFacilityRow = Selectable<SavedFacilitiesTable>;
export type AuditEventRow = Selectable<AuditEventsTable>;
export type OutboxEventRow = Selectable<OutboxEventsTable>;
export type IdempotencyKeyRow = Selectable<IdempotencyKeysTable>;
