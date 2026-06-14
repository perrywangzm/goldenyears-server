import type { Kysely, Transaction } from "kysely";
import { queryPublicFacilities } from "@/domain/search/publicFacilityQuery";
import type {
  Database,
  FacilityRow,
  NewFacilityRow,
  ReferenceItemRow,
  UsersTable,
} from "@/db/schema/types";
import { ApiError } from "@/shared/errors/apiError";
import type { ActorRole } from "@/shared/request-context/context";
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

  async rolesForUser(userId: string): Promise<ActorRole[]> {
    const user = await this.findById(userId);
    return user?.status === "active" ? ["family"] : [];
  }

  async create(row: UsersTable) {
    await this.db.insertInto("users").values(row as never).execute();
    return row;
  }
}

export class KyselySessionRepository {
  constructor(private readonly db: DbExecutor) {}

  async create(row: import("@/db/schema/types").SessionRow) {
    await this.db.insertInto("sessions").values(row as never).execute();
    return row;
  }

  async findActiveByTokenHash(tokenHash: string, now = new Date()) {
    return this.db
      .selectFrom("sessions")
      .selectAll()
      .where("token_hash", "=", tokenHash)
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
    facilities: new KyselyFacilityRepository(db),
    idempotency: new KyselyIdempotencyRepository(db),
    outbox: new KyselyOutboxRepository(db),
    references: new KyselyReferenceRepository(db),
    reviews: new KyselyReviewRepository(db),
    savedFacilities: new KyselySavedFacilityRepository(db),
    sessions: new KyselySessionRepository(db),
    tours: new KyselyTourRepository(db),
    users: new KyselyUserRepository(db),
    articles: emptyArticleRepository,
  };
}
