import type { FacilityRow, ReviewRow } from "@/db/schema/types";
import { availabilityFreshness } from "@/domain/availability/availabilityFreshness";
import { formatSgdPrice } from "@/domain/pricing/monthlyEquivalent";

export interface FacilityCardProjection {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  care_types: string[];
  region_id: string;
  district: string;
  price: { from: number; unit: "month" | "day"; display: string };
  rating: { average: number; count: number; verified_count: number };
  image_url: string;
  features: string[];
  languages: string[];
  availability: {
    status: FacilityRow["availability_status"];
    beds_available: number | null;
    freshness: "fresh" | "stale" | "unknown";
    updated_at: string | null;
  };
  map_marker: { latitude: number; longitude: number } | null;
  is_saved: boolean;
}

export interface FacilityDetailProjection extends FacilityCardProjection {
  address: string;
  postal_code: string;
  gallery_urls: string[];
  capacity: number | null;
  year_opened: number | null;
  licence: string | null;
  about: string;
  highlights: string[];
  right_for_you_if: string[];
}

export function isPublicFacility(row: FacilityRow) {
  return row.status === "approved" && row.is_enabled;
}

export function toFacilityCardProjection(
  row: FacilityRow,
  reviews: ReviewRow[],
  savedFacilityIds: Set<string>,
): FacilityCardProjection {
  const verifiedCount = reviews.filter((review) => review.facility_id === row.id && review.verified).length;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    care_types: row.care_types,
    region_id: row.region_id,
    district: row.district,
    price: {
      from: row.price_from,
      unit: row.price_unit,
      display: formatSgdPrice(row.price_from, row.price_unit),
    },
    rating: { average: row.rating, count: row.review_count, verified_count: verifiedCount },
    image_url: row.image_url,
    features: row.features,
    languages: row.languages,
    availability: {
      status: row.availability_status,
      beds_available: row.beds_available,
      freshness: availabilityFreshness(row.availability_updated_at),
      updated_at: toIso(row.availability_updated_at),
    },
    map_marker:
      row.latitude !== null && row.longitude !== null
        ? { latitude: row.latitude, longitude: row.longitude }
        : null,
    is_saved: savedFacilityIds.has(row.id),
  };
}

function toIso(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

export function toFacilityDetailProjection(
  row: FacilityRow,
  reviews: ReviewRow[],
  savedFacilityIds: Set<string>,
): FacilityDetailProjection {
  return {
    ...toFacilityCardProjection(row, reviews, savedFacilityIds),
    address: row.address,
    postal_code: row.postal_code,
    gallery_urls: row.gallery_urls,
    capacity: row.capacity,
    year_opened: row.year_opened,
    licence: row.licence,
    about: row.about,
    highlights: row.highlights,
    right_for_you_if: row.right_for_you_if,
  };
}
