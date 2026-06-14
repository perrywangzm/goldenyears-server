import type { InMemoryStore } from "./inMemoryStore";

export class SavedFacilityRepository {
  constructor(private readonly store: InMemoryStore) {}

  listForUser(userId: string) {
    return this.store.savedFacilities.filter((save) => save.user_id === userId);
  }

  create(userId: string, facilityId: string) {
    const existing = this.store.savedFacilities.find(
      (save) => save.user_id === userId && save.facility_id === facilityId,
    );
    if (existing) {
      return existing;
    }

    const save = {
      id: `save_${crypto.randomUUID()}`,
      user_id: userId,
      facility_id: facilityId,
      created_at: new Date(),
    };
    this.store.savedFacilities.push(save);
    return save;
  }

  delete(userId: string, facilityId: string) {
    this.store.savedFacilities = this.store.savedFacilities.filter(
      (save) => !(save.user_id === userId && save.facility_id === facilityId),
    );
    return { id: facilityId };
  }

  savedFacilityIdsForUser(userId: string | null) {
    if (!userId) {
      return new Set<string>();
    }
    return new Set(this.listForUser(userId).map((save) => save.facility_id));
  }
}
