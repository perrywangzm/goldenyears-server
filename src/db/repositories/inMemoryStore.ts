import type {
  ArticleRow,
  CompanyRow,
  CompanyUserRow,
  FacilityRow,
  ReviewRow,
  ReferenceItemRow,
  SessionRow,
  TourRequestRow,
  UserRoleRow,
  UserRow,
} from "@/db/schema/types";
import type { AssessmentResultRow } from "@/db/schema/assessmentTypes";
import {
  seedArticles,
  seedCompanies,
  seedCompanyUsers,
  seedFacilities,
  seedPartnerFacilities,
  seedReferenceItems,
  seedReviews,
  seedUserRoles,
  seedUsers,
} from "@/db/seeds/seedData";

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

export interface IdempotencyRecord {
  key: string;
  user_id: string | null;
  request_hash: string;
  response_status: number;
  response_body: unknown;
  expires_at: Date;
  created_at: Date;
}

export interface InMemoryStore {
  users: UserRow[];
  userRoles: UserRoleRow[];
  sessions: SessionRow[];
  companies: CompanyRow[];
  companyUsers: CompanyUserRow[];
  facilities: FacilityRow[];
  reviews: ReviewRow[];
  savedFacilities: SavedFacilityRecord[];
  tourRequests: TourRequestRow[];
  auditEvents: AuditRecord[];
  outboxEvents: OutboxRecord[];
  idempotencyKeys: IdempotencyRecord[];
  referenceItems: ReferenceItemRow[];
  articles: ArticleRow[];
  assessmentResults: AssessmentResultRow[];
}

export function createSeededStore(): InMemoryStore {
  return {
    users: structuredClone(seedUsers),
    userRoles: structuredClone(seedUserRoles),
    sessions: [],
    companies: structuredClone(seedCompanies),
    companyUsers: structuredClone(seedCompanyUsers),
    facilities: structuredClone([...seedFacilities, ...seedPartnerFacilities]),
    reviews: structuredClone(seedReviews),
    savedFacilities: [],
    tourRequests: [],
    auditEvents: [],
    outboxEvents: [],
    idempotencyKeys: [],
    referenceItems: structuredClone(seedReferenceItems),
    articles: structuredClone(seedArticles),
    assessmentResults: [],
  };
}

let singletonStore: InMemoryStore | null = null;

export function getInMemoryStore() {
  singletonStore ??= createSeededStore();
  return singletonStore;
}

export function resetInMemoryStore() {
  singletonStore = createSeededStore();
  return singletonStore;
}
