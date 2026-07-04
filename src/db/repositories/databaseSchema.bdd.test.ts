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
      "companies",
      "company_users",
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

    expect(sql).toMatch(/create table if not exists assessment_results/i);
    expect(sql).toMatch(/create index if not exists assessment_results_user_latest_idx/i);
    expect(sql).toMatch(/create index if not exists assessment_results_owner_session_latest_idx/i);
    expect(sql).toMatch(/sessions[\s\S]*audience session_audience/i);
    expect(sql).toMatch(/users[\s\S]*auth_user_id uuid/i);
    expect(sql).toMatch(/users_auth_user_id_idx/i);
    expect(sql).toMatch(/alter table users alter column password_hash drop not null/i);
    expect(sql).toMatch(/alter table facilities add column if not exists company_id text/i);
    expect(sql).toMatch(/alter table listing_submissions add column if not exists company_id text/i);
    expect(sql).toMatch(/facilities_company_id_fkey[\s\S]*on delete restrict/i);
    expect(sql).toMatch(/listing_submissions_company_id_fkey[\s\S]*on delete restrict/i);

    expect(sql).toMatch(/facilities[\s\S]*version integer not null default 1/i);
    expect(sql).toMatch(/listing_submissions[\s\S]*status listing_submission_status not null/i);
    expect(sql).toMatch(/listing_submissions[\s\S]*version integer not null default 1/i);
    expect(sql).toMatch(/reviews[\s\S]*status review_status not null/i);
    expect(sql).toMatch(/reviews[\s\S]*version integer not null default 1/i);
    expect(sql).toMatch(/tour_requests[\s\S]*status tour_request_status not null/i);
    expect(sql).toMatch(/tour_requests[\s\S]*version integer not null default 1/i);
    expect(sql).toMatch(/outbox_events[\s\S]*status outbox_status not null default 'pending'/i);
  });

  it("Scenario: Partner ownership and audience lookups have supporting indexes", async () => {
    const indexes = extractCreatedIndexes(await readCombinedMigrationSql());
    for (const index of [
      "company_users_user_status_idx",
      "company_users_company_status_idx",
      "facilities_company_id_idx",
      "listing_submissions_company_id_idx",
      "sessions_token_hash_audience_idx",
    ]) {
      expect(indexes.has(index), `${index} index`).toBe(true);
    }
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
