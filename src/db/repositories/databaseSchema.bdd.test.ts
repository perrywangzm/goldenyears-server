import { describe, expect, it } from "vitest";
import {
  extractCreatedIndexes,
  extractCreatedTables,
  readCombinedMigrationSql,
} from "@/db/testing/testDatabase";

describe("Feature: Database migrations", () => {
  it("Scenario: Core migrations create the required source-of-truth tables", async () => {
    const sql = await readCombinedMigrationSql();
    const tables = extractCreatedTables(sql);

    for (const table of [
      "users",
      "sessions",
      "roles",
      "facility_memberships",
      "facilities",
      "listing_submissions",
      "reviews",
      "tour_requests",
      "audit_events",
      "outbox_events",
      "idempotency_keys",
    ]) {
      expect(tables.has(table), `${table} table`).toBe(true);
    }

    expect(sql).toMatch(/facilities[\s\S]*version integer not null default 1/i);
    expect(sql).toMatch(/listing_submissions[\s\S]*status listing_submission_status not null/i);
    expect(sql).toMatch(/listing_submissions[\s\S]*version integer not null default 1/i);
    expect(sql).toMatch(/reviews[\s\S]*status review_status not null/i);
    expect(sql).toMatch(/reviews[\s\S]*version integer not null default 1/i);
    expect(sql).toMatch(/tour_requests[\s\S]*status tour_request_status not null/i);
    expect(sql).toMatch(/tour_requests[\s\S]*version integer not null default 1/i);
    expect(sql).toMatch(/outbox_events[\s\S]*status outbox_status not null default 'pending'/i);
  });
});

describe("Feature: Search and geo indexes", () => {
  it("Scenario: Search projections support text and map queries", async () => {
    const sql = await readCombinedMigrationSql();
    const indexes = extractCreatedIndexes(sql);

    expect(sql).toMatch(/create extension if not exists postgis/i);
    expect(sql).toMatch(/create extension if not exists pg_trgm/i);
    expect(sql).toMatch(/create or replace view public_facility_cards/i);
    expect(indexes.has("facilities_search_document_gin_idx")).toBe(true);
    expect(indexes.has("facilities_name_trgm_idx")).toBe(true);
    expect(indexes.has("facilities_location_gist_idx")).toBe(true);
  });
});
