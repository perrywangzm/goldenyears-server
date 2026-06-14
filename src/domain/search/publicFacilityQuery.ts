import { ApiError } from "@/shared/errors/apiError";
import {
  assertFacilitySort,
  assertMapBounds,
  type MapBounds,
  withinMapBounds,
} from "@/domain/search/searchFilters";
import { flattenFieldPredicates, type ParsedFieldPredicate } from "@/shared/filters/filterDsl";
import type { FilterNode } from "@/shared/filters/filterDsl.schema";
import type { FacilityRow } from "@/db/schema/types";

export interface PublicFacilitySearchInput {
  filters?: FilterNode;
  sort?: Array<{ field: string; dir: "asc" | "desc" }>;
  mapBounds?: MapBounds;
  limit: number;
  offset: number;
}

const allowedFilterFields = new Set([
  "q",
  "care_type",
  "region",
  "feature",
  "language",
  "price_from",
  "availability_status",
]);

function valueList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function matchesPredicate(row: FacilityRow, predicate: ParsedFieldPredicate) {
  if (!allowedFilterFields.has(predicate.field)) {
    throw new ApiError("validation_failed", `Unsupported filter field ${predicate.field}.`, 422, {
      field: predicate.field,
    });
  }

  if (predicate.field === "q") {
    if (predicate.op !== "ilike" && predicate.op !== "like" && predicate.op !== "eq") {
      throw new ApiError("validation_failed", "Unsupported q filter operator.", 422);
    }
    const needle = String(predicate.value).replaceAll("%", "").toLowerCase();
    return `${row.name} ${row.tagline} ${row.district}`.toLowerCase().includes(needle);
  }

  if (predicate.field === "price_from") {
    const numberValue = Number(predicate.value);
    if (predicate.op === "gte") return row.price_from >= numberValue;
    if (predicate.op === "lte") return row.price_from <= numberValue;
    if (predicate.op === "eq") return row.price_from === numberValue;
    throw new ApiError("validation_failed", "Unsupported price filter operator.", 422);
  }

  const fieldValue =
    predicate.field === "care_type"
      ? row.care_types
      : predicate.field === "region"
        ? row.region_id
        : predicate.field === "feature"
          ? row.features
          : predicate.field === "language"
            ? row.languages
            : row.availability_status;

  if (predicate.op === "eq") {
    return Array.isArray(fieldValue)
      ? fieldValue.includes(String(predicate.value))
      : fieldValue === predicate.value;
  }
  if (predicate.op === "in") {
    const values = valueList(predicate.value).map(String);
    return Array.isArray(fieldValue)
      ? fieldValue.some((entry) => values.includes(entry))
      : values.includes(String(fieldValue));
  }

  throw new ApiError("validation_failed", `Unsupported filter operator ${predicate.op}.`, 422, {
    field: predicate.field,
    operator: predicate.op,
  });
}

export function queryPublicFacilities(rows: FacilityRow[], input: PublicFacilitySearchInput) {
  assertFacilitySort(input.sort);
  assertMapBounds(input.mapBounds);
  const predicates = flattenFieldPredicates(input.filters);
  let filtered = rows.filter((row) => row.status === "approved" && row.is_enabled);
  filtered = filtered.filter((row) => predicates.every((predicate) => matchesPredicate(row, predicate)));
  filtered = filtered.filter((row) => withinMapBounds(row.latitude, row.longitude, input.mapBounds));

  const [sort] = input.sort ?? [];
  if (sort?.field === "price_from") {
    filtered = filtered.toSorted((a, b) =>
      sort.dir === "asc" ? a.price_from - b.price_from : b.price_from - a.price_from,
    );
  } else if (sort?.field === "rating") {
    filtered = filtered.toSorted((a, b) => (sort.dir === "asc" ? a.rating - b.rating : b.rating - a.rating));
  } else if (sort?.field === "availability_updated_at") {
    filtered = filtered.toSorted((a, b) => {
      const aTime = a.availability_updated_at ? new Date(a.availability_updated_at).getTime() : 0;
      const bTime = b.availability_updated_at ? new Date(b.availability_updated_at).getTime() : 0;
      return sort.dir === "asc" ? aTime - bTime : bTime - aTime;
    });
  } else {
    filtered = filtered.toSorted((a, b) => a.name.localeCompare(b.name));
  }

  const total = filtered.length;
  return {
    rows: filtered.slice(input.offset, input.offset + input.limit),
    total,
    hasMore: input.offset + input.limit < total,
  };
}
