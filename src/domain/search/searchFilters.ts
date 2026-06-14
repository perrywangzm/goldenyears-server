import { ApiError } from "@/shared/errors/apiError";

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export const allowedFacilitySortFields = new Set([
  "name",
  "price_from",
  "rating",
  "availability_updated_at",
]);

export function assertFacilitySort(sort?: Array<{ field: string; dir: "asc" | "desc" }>) {
  for (const entry of sort ?? []) {
    if (!allowedFacilitySortFields.has(entry.field)) {
      throw new ApiError("validation_failed", `Unsupported sort field ${entry.field}.`, 422, {
        field: entry.field,
      });
    }
  }
}

export function assertMapBounds(bounds?: MapBounds) {
  if (!bounds) {
    return;
  }

  if (bounds.south > bounds.north || bounds.west > bounds.east) {
    throw new ApiError("validation_failed", "Invalid map bounds.", 422, { field: "map_bounds" });
  }
}

export function withinMapBounds(
  latitude: number | null,
  longitude: number | null,
  bounds?: MapBounds,
) {
  if (!bounds) {
    return true;
  }
  if (latitude === null || longitude === null) {
    return false;
  }
  return (
    latitude >= bounds.south &&
    latitude <= bounds.north &&
    longitude >= bounds.west &&
    longitude <= bounds.east
  );
}
