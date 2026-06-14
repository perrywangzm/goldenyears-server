import type { TourRequestRow } from "../schema/types";
import type { InMemoryStore } from "./inMemoryStore";

export class TourRepository {
  constructor(private readonly store: InMemoryStore) {}

  create(row: TourRequestRow) {
    this.store.tourRequests.push(row);
    return row;
  }

  listForUser(userId: string) {
    return this.store.tourRequests
      .filter((tour) => tour.user_id === userId)
      .toSorted((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  countForUser(userId: string) {
    return this.store.tourRequests.filter((tour) => tour.user_id === userId).length;
  }
}
