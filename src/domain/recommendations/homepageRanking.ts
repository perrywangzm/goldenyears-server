import type { FacilityRow } from "@/db/schema/types";

export function rankHomepageFacilities(facilities: FacilityRow[], savedFacilities: FacilityRow[]) {
  const preferredCareTypes = new Set(savedFacilities.flatMap((facility) => facility.care_types));

  return facilities.toSorted((a, b) => {
    const aAffinity = a.care_types.some((careType) => preferredCareTypes.has(careType)) ? 1 : 0;
    const bAffinity = b.care_types.some((careType) => preferredCareTypes.has(careType)) ? 1 : 0;
    if (aAffinity !== bAffinity) {
      return bAffinity - aAffinity;
    }
    if (a.rating !== b.rating) {
      return b.rating - a.rating;
    }
    return a.name.localeCompare(b.name);
  });
}
