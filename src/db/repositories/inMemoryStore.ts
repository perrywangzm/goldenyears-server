import type {
  ArticleRow,
  FacilityRow,
  ReviewRow,
  ReferenceItemRow,
  SessionRow,
  TourRequestRow,
  UserRow,
} from "@/db/schema/types";
import { seedArticles, seedFacilities, seedReferenceItems, seedReviews, seedUsers } from "@/db/seeds/seedData";

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
  sessions: SessionRow[];
  facilities: FacilityRow[];
  reviews: ReviewRow[];
  savedFacilities: SavedFacilityRecord[];
  tourRequests: TourRequestRow[];
  auditEvents: AuditRecord[];
  outboxEvents: OutboxRecord[];
  idempotencyKeys: IdempotencyRecord[];
  referenceItems: ReferenceItemRow[];
  articles: ArticleRow[];
}

export function createSeededStore(): InMemoryStore {
  return {
    users: structuredClone(seedUsers),
    sessions: [],
    facilities: structuredClone(seedFacilities),
    reviews: structuredClone(seedReviews),
    savedFacilities: [],
    tourRequests: [],
    auditEvents: [],
    outboxEvents: [],
    idempotencyKeys: [],
    referenceItems: structuredClone(seedReferenceItems),
    articles: structuredClone(seedArticles),
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
