import { describe, expect, it } from "vitest";
import { buildMockupSeedRows, type MockupFixtures } from "@/db/seeds/importMockupData";
import { createSeededStore } from "./inMemoryStore";
import { FacilityRepository } from "./facilityRepository";
import { ReviewRepository } from "./reviewRepository";
import { SavedFacilityRepository } from "./savedFacilityRepository";
import { toFacilityCardProjection } from "@/db/projections/facilityPublicProjection";

const fixtures: MockupFixtures = {
  facilities: [
    {
      id: "orchid-gardens",
      name: "Orchid Gardens Retirement Living",
      tagline: "Resort-style independent living.",
      careTypes: ["independent", "assisted"],
      region: "central",
      district: "Bukit Timah",
      address: "12 Orchid Drive, Singapore 269710",
      postalCode: "269710",
      priceFrom: 6800,
      priceUnit: "month",
      rating: 4.8,
      reviewCount: 42,
      image: "https://example.com/orchid.jpg",
      gallery: ["https://example.com/orchid-1.jpg"],
      features: ["med247", "garden"],
      languages: ["English", "Mandarin"],
      capacity: 120,
      yearOpened: 2018,
      licence: "MOH-RH-2018-014",
      about: "A public fixture.",
      highlights: ["Private apartments"],
      rightForYouIf: ["You want assisted living."],
      latitude: 1.3503,
      longitude: 103.7755,
      availability: {
        status: "available",
        bedsAvailable: 3,
        note: "Suite and one-bedroom apartments open.",
        updatedAt: "2026-05-09T07:30:00.000Z",
      },
    },
  ],
  reviews: [
    {
      id: "r1",
      facilityId: "orchid-gardens",
      author: "Mei Lin T.",
      relationship: "Daughter of resident",
      rating: 5,
      date: "2026-03-12",
      title: "Mum is genuinely happy here",
      body: "The staff learned her routine quickly.",
      verified: true,
    },
  ],
  careTypes: [{ id: "independent", name: "Independent Living", short: "Active seniors." }],
  features: [{ id: "med247", name: "24/7 medical staff", category: "Medical" }],
  languages: [{ id: "english", name: "English", official: true }],
  regions: [{ id: "central", name: "Central", districts: ["Bukit Timah"] }],
};

describe("Feature: Mockup seed import", () => {
  it("Scenario: Mock facility fixtures become stable backend records", () => {
    const imported = buildMockupSeedRows(fixtures);

    expect(imported.facilities).toHaveLength(1);
    expect(imported.facilities[0]).toMatchObject({
      id: "fac_orchid_gardens",
      company_id: null,
      slug: "orchid-gardens",
      status: "approved",
      is_enabled: true,
    });
    expect(imported.reviews[0]).toMatchObject({
      id: "rev_r1",
      facility_id: "fac_orchid_gardens",
      status: "published",
    });
    expect(imported.referenceItems.map((item) => `${item.kind}:${item.id}`)).toEqual([
      "care_type:independent",
      "feature:med247",
      "language:english",
      "region:central",
    ]);

    const [facility] = imported.facilities;
    const [review] = imported.reviews;
    const projection = toFacilityCardProjection(
      facility as Parameters<typeof toFacilityCardProjection>[0],
      [review as Parameters<typeof toFacilityCardProjection>[1][number]],
      new Set(),
    );

    expect(projection).toMatchObject({
      id: "fac_orchid_gardens",
      slug: "orchid-gardens",
      map_marker: { latitude: 1.3503, longitude: 103.7755 },
      rating: { verified_count: 1 },
    });
  });

  it("Scenario: Mockup full availability status maps into backend records", () => {
    const imported = buildMockupSeedRows({
      ...fixtures,
      facilities: [
        {
          ...fixtures.facilities[0],
          id: "at-capacity-home",
          availability: { status: "full", bedsAvailable: 0, note: "No openings", updatedAt: "2026-05-01T00:00:00.000Z" },
        },
      ],
    });

    expect(imported.facilities[0]?.availability_status).toBe("full");
  });
});

describe("Feature: Public projection safety", () => {
  it("Scenario: Non-public facilities are hidden from public projections", () => {
    const store = createSeededStore();
    store.facilities.push(
      ...["rejected", "disabled", "removed"].map((status) => ({
        ...store.facilities[0],
        id: `fac_${status}`,
        slug: status,
        name: status,
        status: status as "rejected" | "disabled" | "removed",
        is_enabled: true,
      })),
    );
    store.facilities.push({
      ...store.facilities[0],
      id: "fac_approved_disabled",
      slug: "approved-disabled",
      name: "Approved but disabled",
      status: "approved",
      is_enabled: false,
    });

    const facilities = new FacilityRepository(store);
    const reviews = new ReviewRepository(store);
    const savedFacilities = new SavedFacilityRepository(store);
    const result = facilities.listPublic({ limit: 50, offset: 0 });
    const projected = result.rows.map((facility) =>
      toFacilityCardProjection(
        facility,
        reviews.allPublished(),
        savedFacilities.savedFacilityIdsForUser(null),
      ),
    );

    expect(projected.map((facility) => facility.slug)).toEqual([
      "bayshore-nursing",
      "orchid-gardens",
      "serene-heights",
    ]);
    expect(JSON.stringify(projected)).not.toContain("provider_contact_email");
    expect(JSON.stringify(projected)).not.toContain("admin_notes");
    expect(JSON.stringify(projected)).not.toContain("moderation_state");
    expect(JSON.stringify(projected)).not.toContain("private-hidden@example.com");
  });
});
