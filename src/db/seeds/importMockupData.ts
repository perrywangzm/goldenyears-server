import type { Kysely } from "kysely";
import type {
  Database,
  NewFacilityRow,
  NewReviewRow,
  ReferenceItemRow,
} from "@/db/schema/types";

const seedTimestamp = new Date("2026-05-18T00:00:00.000Z");

export interface MockupFixtures {
  facilities: MockupFacility[];
  reviews: MockupReview[];
  careTypes: MockupReference[];
  features: MockupReference[];
  languages: MockupReference[];
  regions: MockupReference[];
}

export interface MockupReference {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface MockupReview {
  id: string;
  facilityId: string;
  author: string;
  relationship: string;
  rating: number;
  date: string;
  title: string;
  body: string;
  verified: boolean;
}

export interface MockupFacility {
  id: string;
  name: string;
  tagline?: string;
  careTypes?: string[];
  region?: string;
  district?: string;
  address?: string;
  postalCode?: string;
  priceFrom?: number;
  priceUnit?: "month" | "day";
  rating?: number;
  reviewCount?: number;
  image?: string;
  gallery?: string[];
  features?: string[];
  languages?: string[];
  capacity?: number;
  yearOpened?: number;
  licence?: string;
  about?: string;
  highlights?: string[];
  rightForYouIf?: string[];
  latitude?: number;
  longitude?: number;
  availability?: {
    status?: "available" | "limited" | "waitlist" | "unavailable" | "full";
    bedsAvailable?: number | null;
    note?: string | null;
    updatedAt?: string | null;
  };
}

export interface ImportedMockupData {
  facilities: NewFacilityRow[];
  reviews: NewReviewRow[];
  referenceItems: ReferenceItemRow[];
}

export function buildMockupSeedRows(fixtures: MockupFixtures): ImportedMockupData {
  const referenceItems = [
    ...toReferenceItems("care_type", fixtures.careTypes),
    ...toReferenceItems("feature", fixtures.features),
    ...toReferenceItems("language", fixtures.languages),
    ...toReferenceItems("region", fixtures.regions),
  ];

  const facilities = fixtures.facilities.map(toFacilityRow);
  const facilityIdBySlug = new Map(facilities.map((facility) => [facility.slug, facility.id]));
  const reviews = fixtures.reviews
    .filter((review) => facilityIdBySlug.has(review.facilityId))
    .map((review) => toReviewRow(review, facilityIdBySlug.get(review.facilityId) ?? review.facilityId));

  return { facilities, reviews, referenceItems };
}

export async function importMockupData(db: Kysely<Database>, fixtures: MockupFixtures) {
  const rows = buildMockupSeedRows(fixtures);

  await db.transaction().execute(async (trx) => {
    for (const item of rows.referenceItems) {
      await trx
        .insertInto("reference_items")
        .values(item)
        .onConflict((oc) =>
          oc.columns(["kind", "id"]).doUpdateSet({
            name: item.name,
            metadata: item.metadata,
            sort_order: item.sort_order,
            updated_at: item.updated_at,
          }),
        )
        .execute();
    }

    for (const facility of rows.facilities) {
      await trx
        .insertInto("facilities")
        .values(facility)
        .onConflict((oc) =>
          oc.column("slug").doUpdateSet({
            name: facility.name,
            tagline: facility.tagline,
            status: facility.status,
            is_enabled: facility.is_enabled,
            care_types: facility.care_types,
            region_id: facility.region_id,
            district: facility.district,
            address: facility.address,
            postal_code: facility.postal_code,
            price_from: facility.price_from,
            price_unit: facility.price_unit,
            rating: facility.rating,
            review_count: facility.review_count,
            image_url: facility.image_url,
            gallery_urls: facility.gallery_urls,
            features: facility.features,
            languages: facility.languages,
            capacity: facility.capacity,
            year_opened: facility.year_opened,
            licence: facility.licence,
            about: facility.about,
            highlights: facility.highlights,
            right_for_you_if: facility.right_for_you_if,
            latitude: facility.latitude,
            longitude: facility.longitude,
            availability_status: facility.availability_status,
            beds_available: facility.beds_available,
            availability_note: facility.availability_note,
            availability_updated_at: facility.availability_updated_at,
            updated_at: facility.updated_at,
          }),
        )
        .execute();
    }

    for (const review of rows.reviews) {
      await trx
        .insertInto("reviews")
        .values(review)
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
            facility_id: review.facility_id,
            author_name: review.author_name,
            relationship: review.relationship,
            rating: review.rating,
            title: review.title,
            body: review.body,
            review_date: review.review_date,
            verified: review.verified,
            status: review.status,
            updated_at: review.updated_at,
          }),
        )
        .execute();
    }
  });

  return rows;
}

function toReferenceItems(kind: ReferenceItemRow["kind"], rows: MockupReference[]): ReferenceItemRow[] {
  return rows.map(({ id, name, ...metadata }, index) => ({
    id: kind === "language" ? id.toLowerCase() : id,
    kind,
    name,
    metadata,
    sort_order: (index + 1) * 10,
    created_at: seedTimestamp,
    updated_at: seedTimestamp,
  }));
}

function toFacilityRow(facility: MockupFacility): NewFacilityRow {
  return {
    id: `fac_${facility.id.replaceAll("-", "_")}`,
    slug: facility.id,
    name: facility.name,
    tagline: facility.tagline ?? "",
    status: "approved",
    is_enabled: true,
    care_types: facility.careTypes ?? [],
    region_id: facility.region ?? "central",
    district: facility.district ?? "",
    address: facility.address ?? "",
    postal_code: facility.postalCode ?? "",
    price_from: facility.priceFrom ?? 0,
    price_unit: facility.priceUnit ?? "month",
    rating: facility.rating ?? 0,
    review_count: facility.reviewCount ?? 0,
    image_url: facility.image ?? "",
    gallery_urls: facility.gallery ?? [],
    features: facility.features ?? [],
    languages: facility.languages ?? [],
    capacity: facility.capacity ?? null,
    year_opened: facility.yearOpened ?? null,
    licence: facility.licence ?? null,
    about: facility.about ?? "",
    highlights: facility.highlights ?? [],
    right_for_you_if: facility.rightForYouIf ?? [],
    latitude: facility.latitude ?? null,
    longitude: facility.longitude ?? null,
    availability_status: facility.availability?.status ?? "unavailable",
    beds_available: facility.availability?.bedsAvailable ?? null,
    availability_note: facility.availability?.note ?? null,
    availability_updated_at: facility.availability?.updatedAt ?? null,
    provider_contact_email: null,
    admin_notes: null,
    moderation_state: "approved",
    version: 1,
    created_at: seedTimestamp,
    updated_at: seedTimestamp,
  };
}

function toReviewRow(review: MockupReview, facilityId: string): NewReviewRow {
  return {
    id: `rev_${review.id.replaceAll("-", "_")}`,
    facility_id: facilityId,
    author_name: review.author,
    relationship: review.relationship,
    rating: review.rating,
    title: review.title,
    body: review.body,
    review_date: review.date,
    verified: review.verified,
    status: "published",
    version: 1,
    created_at: seedTimestamp,
    updated_at: seedTimestamp,
  };
}
