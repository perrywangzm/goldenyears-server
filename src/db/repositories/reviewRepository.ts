import type { InMemoryStore } from "./inMemoryStore";

export class ReviewRepository {
  constructor(private readonly store: InMemoryStore) {}

  listPublishedForFacility(facilityId: string, limit: number, offset: number) {
    const rows = this.store.reviews
      .filter((review) => review.facility_id === facilityId && review.status === "published")
      .toSorted((a, b) => b.review_date.localeCompare(a.review_date));
    return {
      rows: rows.slice(offset, offset + limit),
      total: rows.length,
      hasMore: offset + limit < rows.length,
    };
  }

  allPublished() {
    return this.store.reviews.filter((review) => review.status === "published");
  }
}
