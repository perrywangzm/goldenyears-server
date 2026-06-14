import { ApiError } from "@/shared/errors/apiError";
import { queryPublicFacilities, type PublicFacilitySearchInput } from "@/domain/search/publicFacilityQuery";
import type { InMemoryStore } from "./inMemoryStore";

export type FacilitySearchInput = PublicFacilitySearchInput;

export class FacilityRepository {
  constructor(private readonly store: InMemoryStore) {}

  listPublic(input: FacilitySearchInput) {
    return queryPublicFacilities(this.store.facilities, input);
  }

  findPublicById(idOrSlug: string) {
    const row = this.store.facilities.find((facility) => facility.id === idOrSlug || facility.slug === idOrSlug);
    if (!row || row.status !== "approved" || !row.is_enabled) {
      throw new ApiError("facility_not_found", "Facility was not found.", 404, { id: idOrSlug });
    }
    return row;
  }

  listPublicByIds(ids: Set<string>) {
    if (ids.size === 0) {
      return [];
    }
    return this.store.facilities.filter(
      (facility) => ids.has(facility.id) && facility.status === "approved" && facility.is_enabled,
    );
  }
}
