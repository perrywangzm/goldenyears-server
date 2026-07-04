import { getInMemoryStore, type InMemoryStore } from "./inMemoryStore";
import { AssessmentRepository } from "./assessmentRepository";
import { ArticleRepository } from "./articleRepository";
import { AuditRepository } from "./auditRepository";
import { CompanyRepository } from "./companyRepository";
import { CompanyUserRepository } from "./companyUserRepository";
import { FacilityRepository } from "./facilityRepository";
import { IdempotencyRepository } from "./idempotencyRepository";
import { OutboxRepository } from "./outboxRepository";
import { PartnerFacilityRepository } from "./partnerFacilityRepository";
import { ReferenceRepository } from "./referenceRepository";
import { ReviewRepository } from "./reviewRepository";
import { SavedFacilityRepository } from "./savedFacilityRepository";
import { SessionRepository } from "./sessionRepository";
import { TourRepository } from "./tourRepository";
import { UserRepository } from "./userRepository";

export { createAsyncInMemoryRepositories, getInMemoryStore, type InMemoryStore } from "./asyncInMemoryRepositories";
export { createKyselyRepositories } from "./kyselyRepositories";
export type { Repositories } from "./ports";

/** Sync in-memory bundle for unit tests that touch repositories directly. */
export function createRepositories(store: InMemoryStore = getInMemoryStore()) {
  return {
    articles: new ArticleRepository(store),
    audit: new AuditRepository(store),
    companies: new CompanyRepository(store),
    companyUsers: new CompanyUserRepository(store),
    facilities: new FacilityRepository(store),
    idempotency: new IdempotencyRepository(store),
    outbox: new OutboxRepository(store),
    partnerFacilities: new PartnerFacilityRepository(store),
    references: new ReferenceRepository(store),
    reviews: new ReviewRepository(store),
    savedFacilities: new SavedFacilityRepository(store),
    sessions: new SessionRepository(store),
    tours: new TourRepository(store),
    users: new UserRepository(store),
    assessments: new AssessmentRepository(store),
    store,
  };
}

export type SyncRepositories = ReturnType<typeof createRepositories>;
