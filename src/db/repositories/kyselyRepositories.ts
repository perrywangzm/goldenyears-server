import type { Kysely, Transaction } from "kysely";
import { queryPublicFacilities } from "@/domain/search/publicFacilityQuery";
import type {
  Database,
  FacilityRow,
  NewFacilityRow,
  ReferenceItemRow,
  UserRow,
  UsersTable,
} from "@/db/schema/types";
import { ApiError } from "@/shared/errors/apiError";
import type { ActorRole } from "@/shared/request-context/context";
import type { SessionAudience } from "@/shared/authz/sessionAudience";
import type { FacilitySearchInput } from "./facilityRepository";
import type {
  AuditRecord,
  IdempotencyRepositoryPort,
  OutboxRecord,
  Repositories,
  SavedFacilityRecord,
} from "./ports";

type DbExecutor = Kysely<Database> | Transaction<Database>;

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
    return this.db.selectFrom("facilities").selectAll().where("slug", "=", slug).executeTakeFirst();
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
      .where((eb) => eb.or([eb("id", "=", idOrSlug), eb("slug", "=", idOrSlug)]))
      .where("status", "=", "approved")
      .where("is_enabled", "=", true)
      .executeTakeFirst();

    if (!row) {
      throw new ApiError("facility_not_found", "Facility was not found.", 404, { id: idOrSlug });
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
    let query = this.db.selectFrom("reference_items").selectAll().orderBy("sort_order", "asc").orderBy("name", "asc");
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

    const fallbackFeatures = [...new Set(publicFacilities.flatMap((facility) => facility.features))].map((id) => ({
      id,
      name: id.replaceAll("_", " "),
    }));
    const fallbackLanguages = [...new Set(publicFacilities.flatMap((facility) => facility.languages))].map((id) => ({
      id,
      name: id,
    }));
    const prices = publicFacilities.map((facility) => facility.price_from);

    return {
      care_types: byKind("care_type"),
      regions: byKind("region"),
      features: byKind("feature").length > 0 ? byKind("feature") : fallbackFeatures,
      languages: byKind("language").length > 0 ? byKind("language") : fallbackLanguages,
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
    return this.db.selectFrom("users").selectAll().where("id", "=", id).executeTakeFirst();
  }

  async findByAuthUserId(authUserId: string) {
    return this.db.selectFrom("users").selectAll().where("auth_user_id", "=", authUserId).executeTakeFirst();
  }

  async linkAuthUserId(userId: string, authUserId: string, patch?: { display_name?: string }) {
    try {
      const linked = await this.db
        .updateTable("users")
        .set({
          auth_user_id: authUserId,
          ...(patch?.display_name ? { display_name: patch.display_name } : {}),
          updated_at: new Date(),
        })
        .where("id", "=", userId)
        .where((eb) => eb.or([eb("auth_user_id", "is", null), eb("auth_user_id", "=", authUserId)]))
        .returningAll()
        .executeTakeFirst();
      if (linked) return linked;
    } catch (error) {
      const owner = await this.findByAuthUserId(authUserId);
      if (owner?.id === userId) return owner;
      throw new ApiError("conflict", "This identity is linked to a different account.", 409);
    }
    const current = await this.findById(userId);
    if (current?.auth_user_id === authUserId) return current;
    throw new ApiError("conflict", "This account is linked to a different identity.", 409);
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
    await this.db.insertInto("users").values(row as never).execute();
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
    await this.db.insertInto("users").values(row as never).execute();
    return row;
  }
}

export class KyselyCompanyRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: string) {
    return this.db.selectFrom("companies").selectAll().where("id", "=", id).executeTakeFirst();
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
    await this.db.insertInto("sessions").values(row as never).execute();
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

  async listAccessibleForUser(userId: string, input: { limit: number; offset: number }) {
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

  private accessibleForUser(userId: string) {
    return this.db
      .selectFrom("facilities")
      .innerJoin("companies", "companies.id", "facilities.company_id")
      .innerJoin("company_users", "company_users.company_id", "companies.id")
      .where("company_users.user_id", "=", userId)
      .where("company_users.status", "=", "active")
      .where("companies.status", "=", "active");
  }
}

export class KyselySavedFacilityRepository {
  constructor(private readonly db: DbExecutor) {}

  async create(userId: string, facilityId: string): Promise<SavedFacilityRecord> {
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
      .values({ id, user_id: userId, facility_id: facilityId, created_at: new Date() })
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

  async create(row: import("@/db/schema/types").TourRequestRow) {
    await this.db.insertInto("tour_requests").values(row as never).execute();
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
}

export class KyselyReviewRepository {
  constructor(private readonly db: DbExecutor) {}

  async listPublishedForFacility(facilityId: string, limit: number, offset: number) {
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
    return this.db.selectFrom("reviews").selectAll().where("status", "=", "published").execute();
  }
}

export class KyselyAuditRepository {
  constructor(private readonly db: DbExecutor) {}

  async write(row: AuditRecord) {
    await this.db.insertInto("audit_events").values(row as never).execute();
    return row;
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

  async create(row: import("@/db/repositories/inMemoryStore").IdempotencyRecord) {
    await this.db.insertInto("idempotency_keys").values(row as never).execute();
    return row;
  }
}

export class KyselyAssessmentRepository {
  constructor(private readonly db: DbExecutor) {}

  async create(input: import("./assessmentRepository").CreateAssessmentResultInput) {
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

    await this.db.insertInto("assessment_results").values(input as never).execute();
    return this.findById(input.id) as Promise<import("@/db/schema/assessmentTypes").AssessmentResultRow>;
  }

  async findLatestForOwner(input: { user_id: string | null; owner_session_id: string | null }) {
    let query = this.db.selectFrom("assessment_results").selectAll().where("is_latest", "=", true);
    if (input.user_id) {
      query = query.where("user_id", "=", input.user_id);
    } else if (input.owner_session_id) {
      query = query.where("user_id", "is", null).where("owner_session_id", "=", input.owner_session_id);
    } else {
      return undefined;
    }
    return query.executeTakeFirst();
  }

  async findById(id: string) {
    return this.db.selectFrom("assessment_results").selectAll().where("id", "=", id).executeTakeFirst();
  }

  async deleteLatestForOwner(input: import("./assessmentRepository").AssessmentOwnerScope) {
    const row = await this.findLatestForOwner(input);
    if (!row) return null;
    await this.db.updateTable("assessment_results").set({ is_latest: false }).where("id", "=", row.id).execute();
    return { id: row.id };
  }

  async claimAnonymousSession(anonymousSessionId: string, userId: string, sessionId: string | null) {
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
    throw new ApiError("article_not_found", "Article was not found.", 404, { id: idOrSlug });
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
