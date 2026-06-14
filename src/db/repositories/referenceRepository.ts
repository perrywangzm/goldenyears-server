import type { InMemoryStore } from "./inMemoryStore";

export class ReferenceRepository {
  constructor(private readonly store: InMemoryStore) {}

  getSearchOptions() {
    const publicFacilities = this.store.facilities.filter(
      (facility) => facility.status === "approved" && facility.is_enabled,
    );
    const byKind = (kind: "care_type" | "feature" | "language" | "region") =>
      this.store.referenceItems
        .filter((item) => item.kind === kind)
        .toSorted((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
        .map(({ id, name }) => ({ id, name }));

    const fallbackFeatures = [...new Set(publicFacilities.flatMap((facility) => facility.features))].map((id) => ({
      id,
      name: id.replaceAll("_", " "),
    }));
    const fallbackLanguages = [...new Set(publicFacilities.flatMap((facility) => facility.languages))].map((id) => ({
      id,
      name: id,
    }));

    return {
      care_types: byKind("care_type"),
      regions: byKind("region"),
      features: byKind("feature").length > 0 ? byKind("feature") : fallbackFeatures,
      languages: byKind("language").length > 0 ? byKind("language") : fallbackLanguages,
      price_range: {
        min: Math.min(...publicFacilities.map((facility) => facility.price_from)),
        max: Math.max(...publicFacilities.map((facility) => facility.price_from)),
        currency: "SGD",
      },
    };
  }
}
