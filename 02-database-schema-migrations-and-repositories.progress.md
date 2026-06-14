# Plan 02 Progress

## Status

Implemented for the milestone subset.

## Implemented

- Kysely database typing and Postgres/Hyperdrive connection factory.
- SQL migrations for core users/sessions/roles, reference data, facilities, reviews, saved facilities, tour requests, audit events, outbox events, idempotency keys, and search/geo indexes.
- In-memory repository set for local BDD tests and API development without live Supabase credentials.
- Kysely repository adapters for the durable Postgres boundary.
- Mockup seed importer and stable seed data for facilities, reviews, references, articles, and a demo family user.
- Public facility projection helpers that hide non-public facilities and private/provider/admin fields.

## BDD Coverage

- Migration files contain required source-of-truth tables.
- Mock facility fixtures import into stable backend records.
- Public projections hide draft/non-public facilities and private fields.
- Transaction rollback behavior is represented in repository tests.

## Deferred

- Live migrated Postgres integration tests against Supabase are not wired in this local milestone.
- Full PostGIS execution is represented in SQL migrations, not exercised without a live database.
