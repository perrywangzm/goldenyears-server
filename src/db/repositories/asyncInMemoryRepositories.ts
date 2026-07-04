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
import type { Repositories } from "./ports";
import { ReferenceRepository } from "./referenceRepository";
import { ReviewRepository } from "./reviewRepository";
import { SavedFacilityRepository } from "./savedFacilityRepository";
import { SessionRepository } from "./sessionRepository";
import { TourRepository } from "./tourRepository";
import { UserRepository } from "./userRepository";

function promisify<T>(value: T): Promise<T> {
  return Promise.resolve(value);
}

function wrapSyncRepositories(store: InMemoryStore): Repositories {
  const facilities = new FacilityRepository(store);
  const companies = new CompanyRepository(store);
  const companyUsers = new CompanyUserRepository(store);
  const partnerFacilities = new PartnerFacilityRepository(store);
  const reviews = new ReviewRepository(store);
  const references = new ReferenceRepository(store);
  const users = new UserRepository(store);
  const sessions = new SessionRepository(store);
  const savedFacilities = new SavedFacilityRepository(store);
  const tours = new TourRepository(store);
  const articles = new ArticleRepository(store);
  const assessments = new AssessmentRepository(store);
  const audit = new AuditRepository(store);
  const outbox = new OutboxRepository(store);
  const idempotency = new IdempotencyRepository(store);

  return {
    companies: {
      findById: (id) => promisify(companies.findById(id)),
      listActiveForUser: (userId) => promisify(companies.listActiveForUser(userId)),
    },
    companyUsers: {
      listActiveForUser: (userId) => promisify(companyUsers.listActiveForUser(userId)),
      findActiveMembership: (userId, companyId) =>
        promisify(companyUsers.findActiveMembership(userId, companyId)),
      countActiveCompanies: (userId) => promisify(companyUsers.countActiveCompanies(userId)),
    },
    facilities: {
      listPublic: (input) => promisify(facilities.listPublic(input)),
      findPublicById: (idOrSlug) => promisify(facilities.findPublicById(idOrSlug)),
      listPublicByIds: (ids) => promisify(facilities.listPublicByIds(ids)),
    },
    partnerFacilities: {
      listAccessibleForUser: (userId, input) =>
        promisify(partnerFacilities.listAccessibleForUser(userId, input)),
      findAccessibleForUserAndFacility: (userId, facilityId) =>
        promisify(partnerFacilities.findAccessibleForUserAndFacility(userId, facilityId)),
    },
    reviews: {
      listPublishedForFacility: (facilityId, limit, offset) =>
        promisify(reviews.listPublishedForFacility(facilityId, limit, offset)),
      allPublished: () => promisify(reviews.allPublished()),
    },
    references: {
      getSearchOptions: () => promisify(references.getSearchOptions()),
    },
    users: {
      findByEmail: (email) => promisify(users.findByEmail(email)),
      findById: (id) => promisify(users.findById(id)),
      findByAuthUserId: (authUserId) => promisify(users.findByAuthUserId(authUserId)),
      linkAuthUserId: (userId, authUserId, patch) =>
        promisify(users.linkAuthUserId(userId, authUserId, patch)),
      createFromAuthIdentity: (input) => promisify(users.createFromAuthIdentity(input)),
      updateProfile: (userId, patch) => promisify(users.updateProfile(userId, patch)),
      rolesForUser: (userId) => promisify(users.rolesForUser(userId)),
    },
    sessions: {
      create: (session) => promisify(sessions.create(session)),
      findActiveByTokenHash: (tokenHash, audience, now) =>
        promisify(sessions.findActiveByTokenHash(tokenHash, audience, now)),
      revoke: (sessionId, now) => promisify(sessions.revoke(sessionId, now)).then(() => undefined),
    },
    savedFacilities: {
      listForUser: (userId) => promisify(savedFacilities.listForUser(userId)),
      create: (userId, facilityId) => promisify(savedFacilities.create(userId, facilityId)),
      delete: (userId, facilityId) => promisify(savedFacilities.delete(userId, facilityId)),
      savedFacilityIdsForUser: (userId) => promisify(savedFacilities.savedFacilityIdsForUser(userId)),
    },
    tours: {
      create: (row) => promisify(tours.create(row)),
      listForUser: (userId) => promisify(tours.listForUser(userId)),
      countForUser: (userId) => promisify(tours.countForUser(userId)),
    },
    articles: {
      listPublished: (limit, offset) => promisify(articles.listPublished(limit, offset)),
      getPublished: (idOrSlug) => promisify(articles.getPublished(idOrSlug)),
    },
    assessments: {
      create: (input) => promisify(assessments.create(input)),
      findLatestForOwner: (input) => promisify(assessments.findLatestForOwner(input)),
      findById: (id) => promisify(assessments.findById(id)),
      deleteLatestForOwner: (input) => promisify(assessments.deleteLatestForOwner(input)),
      claimAnonymousSession: (anonymousSessionId, userId, sessionId) =>
        promisify(assessments.claimAnonymousSession(anonymousSessionId, userId, sessionId)),
    },
    audit: {
      write: (event) => promisify(audit.write(event)),
    },
    outbox: {
      write: (event) => promisify(outbox.write(event)),
    },
    idempotency: {
      find: (key, userId, now) => promisify(idempotency.find(key, userId, now)),
      create: (record) => promisify(idempotency.create(record)),
    },
  };
}

export function createAsyncInMemoryRepositories(store: InMemoryStore = getInMemoryStore()): Repositories {
  return wrapSyncRepositories(store);
}

export { getInMemoryStore, type InMemoryStore };
