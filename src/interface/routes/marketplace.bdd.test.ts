import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRepositories } from "@/db/repositories";
import { resetInMemoryStore } from "@/db/repositories/inMemoryStore";
import { sha256 } from "@/platform/crypto/passwordService";
import { createHttpTestClient } from "@/shared/testing/httpTestClient";

async function json(response: Response) {
  return response.json() as Promise<any>;
}

describe("public marketplace APIs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T12:00:00.000Z"));
    resetInMemoryStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("search_facilities returns safe card and map projections for public approved facilities only", async () => {
    const client = createHttpTestClient();
    const response = await client.post("/api/v1/search_facilities", {
      filters: { region: { eq: "central" } },
      sort: [{ field: "rating", dir: "desc" }],
      page: { type: "offset", limit: 10, offset: 0 },
    });
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body.data.map((facility: any) => facility.id)).toEqual([
      "fac_orchid_gardens",
      "fac_serene_heights",
    ]);
    expect(body.data.find((facility: any) => facility.id === "fac_hidden_draft")).toBeUndefined();
    expect(body.data[0]).toMatchObject({
      id: "fac_orchid_gardens",
      availability: { status: "available", freshness: "fresh" },
      price: { from: 6800, unit: "month" },
      rating: { average: 4.8, count: 42, verified_count: 1 },
      map_marker: { latitude: 1.3503, longitude: 103.7755 },
    });
    expect(JSON.stringify(body)).not.toContain("provider_contact_email");
    expect(JSON.stringify(body)).not.toContain("admin_notes");
    expect(JSON.stringify(body)).not.toContain("moderation_state");
    expect(JSON.stringify(body)).not.toContain("provider-private@example.com");
  });

  it("search_facilities validates supported filters and map bounds", async () => {
    const client = createHttpTestClient();
    const filtered = await client.post("/api/v1/search_facilities", {
      filters: {
        care_type: { in: ["assisted"] },
        feature: { in: ["halal"] },
        language: { eq: "Malay" },
        price_from: { lte: 4000 },
        availability_status: { in: ["limited", "available"] },
      },
      map_bounds: { north: 1.34, south: 1.33, east: 103.86, west: 103.84 },
      page: { type: "offset", limit: 20, offset: 0 },
    });
    const filteredBody = await json(filtered);
    expect(filtered.status).toBe(200);
    expect(filteredBody.data.map((facility: any) => facility.id)).toEqual(["fac_serene_heights"]);

    const unsupported = await client.post("/api/v1/search_facilities", {
      filters: { provider_contact_email: { eq: "provider-private@example.com" } },
    });
    const unsupportedBody = await json(unsupported);
    expect(unsupported.status).toBe(422);
    expect(unsupportedBody.error.code).toBe("validation_failed");

    const unsupportedSort = await client.post("/api/v1/search_facilities", {
      sort: [{ field: "priceFrom", dir: "asc" }],
    });
    const unsupportedSortBody = await json(unsupportedSort);
    expect(unsupportedSort.status).toBe(422);
    expect(unsupportedSortBody.error).toMatchObject({
      code: "validation_failed",
      details: { field: "priceFrom" },
    });

    const invalidBounds = await client.post("/api/v1/search_facilities", {
      map_bounds: { north: 1.33, south: 1.34, east: 103.86, west: 103.84 },
    });
    const invalidBoundsBody = await json(invalidBounds);
    expect(invalidBounds.status).toBe(422);
    expect(invalidBoundsBody.error).toMatchObject({
      code: "validation_failed",
      details: { field: "map_bounds" },
    });
  });

  it("get_facility returns a complete safe detail projection", async () => {
    const client = createHttpTestClient();
    const response = await client.post("/api/v1/get_facility", { id: "orchid-gardens" });
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      id: "fac_orchid_gardens",
      slug: "orchid-gardens",
      address: "12 Orchid Drive, Singapore 269710",
      postal_code: "269710",
      gallery_urls: expect.any(Array),
      highlights: expect.any(Array),
      right_for_you_if: expect.any(Array),
      licence: "MOH-RH-2018-014",
    });
    expect(JSON.stringify(body)).not.toContain("provider_contact_email");
    expect(JSON.stringify(body)).not.toContain("admin_notes");
    expect(JSON.stringify(body)).not.toContain("moderation_state");
  });

  it("get_homepage safely ranks signed-in affinity recommendations and can exclude saved facilities", async () => {
    const store = resetInMemoryStore();
    const repos = createRepositories(store);
    const token = "homepage-test-token";
    repos.sessions.create({
      id: "sess_homepage",
      user_id: "usr_family_demo",
      token_hash: await sha256(token),
      audience: "user",
      expires_at: new Date("2026-06-01T00:00:00.000Z"),
      created_at: new Date("2026-05-18T00:00:00.000Z"),
      revoked_at: null,
    });
    repos.savedFacilities.create("usr_family_demo", "fac_orchid_gardens");

    const client = createHttpTestClient();
    const response = await client.post(
      "/api/v1/get_homepage",
      { exclude_saved: true },
      { cookie: `gy_user_session=${token}` },
    );
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body.data.recommendation_request_id).toMatch(/^rec_/);
    expect(body.data.recommended_facilities.map((facility: any) => facility.id)).not.toContain(
      "fac_orchid_gardens",
    );
    expect(body.data.recommended_facilities[0].care_types).toContain("assisted");
    expect(JSON.stringify(body)).not.toContain("provider-private@example.com");
  });

  it("list_facility_reviews and article reads expose current route needs", async () => {
    const client = createHttpTestClient();

    const reviews = await client.post("/api/v1/list_facility_reviews", {
      id: "fac_orchid_gardens",
      page: { type: "offset", limit: 10, offset: 0 },
    });
    const reviewsBody = await json(reviews);
    expect(reviews.status).toBe(200);
    expect(reviewsBody.data[0]).toMatchObject({ id: "rev_1", verified: true });
    expect(JSON.stringify(reviewsBody)).not.toContain("status");

    const articles = await client.post("/api/v1/list_articles", {
      page: { type: "offset", limit: 10, offset: 0 },
    });
    const articlesBody = await json(articles);
    expect(articles.status).toBe(200);
    expect(articlesBody.data[0].slug).toBe("how-to-tour-a-care-home");

    const article = await client.post("/api/v1/get_article", { id: "how-to-tour-a-care-home" });
    const articleBody = await json(article);
    expect(article.status).toBe(200);
    expect(articleBody.data.title).toBe("How to tour a care home");
  });
});
