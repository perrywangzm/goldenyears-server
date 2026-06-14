# Plan 02: Database Schema, Migrations, And Repositories

## Required Context Bundle

Give the implementation agent exactly these two files:

1. `golden-years-server-next/README.md`
2. `golden-years-server-next/02-database-schema-migrations-and-repositories.plan.md`

The README is the source of truth for whole-system architecture, shared vocabulary, and safety rules. This file is the step-specific plan.

## Step Context

Golden Years is workflow-heavy and audit-heavy, so Postgres must become the source of truth before endpoint work gets broad. This step creates migrations, typed DB access, repositories, projections, and seed import paths that later API modules can depend on.

## Goal

Implement the initial Postgres schema, Kysely integration, migration workflow, seed importers, and repository contracts for core Golden Years records and public projections.

## Proposed Files

```text
apps/api/src/db/index.ts
apps/api/src/db/kysely.ts
apps/api/src/db/migrate.ts
apps/api/src/db/schema/types.ts
apps/api/src/db/repositories/facilityRepository.ts
apps/api/src/db/repositories/referenceRepository.ts
apps/api/src/db/repositories/userRepository.ts
apps/api/src/db/repositories/tourRepository.ts
apps/api/src/db/repositories/reviewRepository.ts
apps/api/src/db/repositories/auditRepository.ts
apps/api/src/db/repositories/outboxRepository.ts
apps/api/src/db/repositories/idempotencyRepository.ts
apps/api/src/db/projections/facilityPublicProjection.ts
apps/api/src/db/seeds/importMockupData.ts
apps/api/src/db/testing/testDatabase.ts
apps/api/src/db/migrations/0001_core.sql
apps/api/src/db/migrations/0002_facility_marketplace.sql
apps/api/src/db/migrations/0003_workflow_audit_outbox.sql
apps/api/src/db/migrations/0004_search_geo_indexes.sql
apps/api/src/db/repositories/*.bdd.test.ts
tools/seed-import/importMockupFixtures.ts
```

## BDD Scenarios

```gherkin
Feature: Database migrations
Scenario: Core migrations create the required source-of-truth tables
  Given an empty Postgres database
  When the migration runner applies all migrations
  Then users, sessions, roles, facility_memberships, facilities, listing_submissions, reviews, tour_requests, audit_events, outbox_events, and idempotency_keys tables exist
  And each workflow-owned table has a version or status column where required
```

```gherkin
Feature: Mockup seed import
Scenario: Mock facility fixtures become stable backend records
  Given the mockup facility, review, care type, feature, language, and region fixtures
  When the seed importer runs
  Then imported facilities have internal IDs and public slugs
  And public card projections can be built without reading mockup files at runtime
```

```gherkin
Feature: Public projection safety
Scenario: Non-public facilities are hidden from public projections
  Given facilities with approved, draft, rejected, disabled, and removed statuses
  When the public facility projection is queried
  Then only approved and enabled public facilities are returned
  And provider contact emails, admin notes, moderation fields, and audit data are excluded
```

```gherkin
Feature: Transaction integrity
Scenario: A repository transaction rolls back every write on failure
  Given a transaction writes a facility update and an audit event
  When a later write in the transaction fails
  Then neither the facility update nor audit event is committed
```

```gherkin
Feature: Search and geo indexes
Scenario: Search projections support text and map queries
  Given migrated facility search data with coordinates
  When the index inspection test runs
  Then full-text, trigram, and spatial indexes exist for the public search projection
```

## Implementation Notes

- Prefer SQL migrations for DDL, indexes, triggers, and PostGIS setup.
- Keep Kysely types generated or declared in one DB schema boundary.
- Use internal IDs plus public slugs for facilities and articles.
- Include public projection rows or views for facility cards, detail summaries, search, and map markers.
- Model outbox, audit, and idempotency as first-class tables from the start.
- Seed importers may read mockup fixtures as build/dev input, but runtime code must not import `golden-years-mockup`.

## Non-Goals

- No HTTP endpoints.
- No auth/session behavior beyond tables needed for later services.
- No email, queue, R2, or external provider calls.
- No dedicated search engine integration.

## Acceptance Criteria

- All BDD scenarios pass as automated tests.
- Migrations can be applied to a clean database and re-run safely through the migration tool.
- Seed import produces stable IDs/slugs and projection-ready data.
- Repository methods expose typed records and hide SQL details from application services.
- Public projections enforce visibility and field-level safety.
