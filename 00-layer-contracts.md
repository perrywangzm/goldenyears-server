# Layer Contracts

## Boundary Policy

The backend is the logic owner. The frontend may reflect the mockup visually, but it must receive render-ready, permission-safe, workflow-safe data from APIs and frontend viewmodels. No UI component should need to understand backend envelopes, workflow transitions, role matrices, SQL entities, or provider adapters.

## API Interface Layer

Purpose: expose a uniform HTTP contract.

Owns:

- Hono route registration.
- Zod request and response schemas.
- OpenAPI operation metadata.
- Envelope wrapping and unwrapping.
- Request IDs, CORS, CSRF hook, content-type enforcement, and middleware order.
- Mapping thrown application errors to standard error envelopes.

Rules:

- No SQL.
- No external provider calls.
- No business state transitions.
- Keep handlers thin: validate, derive request context, call application service, return envelope.

## Application Service Layer

Purpose: implement one user intent or workflow operation.

Owns:

- Transaction boundaries.
- Idempotency handling.
- Authorization policy calls.
- Domain service orchestration.
- Repository calls.
- Audit and outbox writes.
- Optimistic concurrency decisions.

Rules:

- Services should accept explicit command objects plus `RequestContext`.
- Services return DTO/projection results, not raw database rows.
- A mutation that changes business state should write business data, audit, idempotency result, and outbox records atomically.

## Domain Service Layer

Purpose: model Golden Years product behavior without Hono, DB, queues, or platform concerns.

Owns:

- Availability freshness and public labels.
- Price normalization and monthly equivalent rules.
- Search filter normalization and ranking inputs.
- Tour slot eligibility and tour state transitions.
- Review eligibility and one-review-per-attended-tour rule.
- Listing submission workflow rules.
- Licence verification status rules.
- Assessment scoring.
- Cost-calculator policy execution.
- Shortlist revision and share-token invariants.

Rules:

- Prefer pure functions.
- No direct imports from interface, db, or platform folders.
- Export input/output types when another module consumes the rule.

## Authorization Layer

Purpose: centralize who can do what.

Owns:

- Role capability helpers.
- Facility membership checks.
- Admin/moderator/CMS editor scopes.
- Public/private field policy.
- On-behalf-of validation for privileged endpoints.

Rules:

- Feature flags are not authorization.
- Facility manager permissions are membership-based, not email matching.
- Public read policies must hide disabled, rejected, removed, unpublished, and unauthorized preview records.

## DB Integration Layer

Purpose: isolate SQL and persistence mapping.

Owns:

- SQL migrations.
- Kysely table typings and database connection.
- Repositories.
- Projections and materialized views.
- Seed import from mockup fixtures.
- PostGIS, full-text, trigram, and JSONB index definitions.

Rules:

- Return typed domain/application records or projection records, not unreviewed `any`.
- Keep Postgres-specific SQL inside repositories, migrations, or projection builders.
- Migrations run outside Worker request handlers.

## Platform Adapter Layer

Purpose: isolate Cloudflare and vendor APIs.

Owns:

- R2 media access.
- Queue producers and consumers.
- Cron scheduling entrypoints.
- Resend/Brevo email adapter.
- Geocoder adapter.
- Cache/KV adapter.
- Rate-limit adapter.
- Clock, ID generation, and secrets/config access.

Rules:

- Application services depend on small ports, not vendor SDK details.
- Adapters do not make authorization decisions.
- Provider errors are normalized before crossing into application services.

## Utility Layer

Purpose: small, stable helpers that cut across modules.

Owns:

- Envelopes and error types.
- Filter DSL parsing.
- Pagination cursor encoding.
- Canonical JSON and cache-key hashing.
- Request context.
- Structured logging helpers.
- Test fixtures.
- Data redaction.

Rules:

- No feature-module imports.
- No hidden side effects.
- Keep helpers typed and boring.

## Dependency Direction

```text
entrypoints -> interface -> application -> domain
                                  |
                                  v
                              db/platform/shared

domain -> shared only
db -> shared/config only
platform -> shared/config/errors only
shared -> no feature imports
```

Forbidden:

- Interface importing repository internals directly.
- Domain importing DB, Hono, queues, R2, or environment variables.
- UI or frontend contracts depending on database row shapes.
- Generated client code driving backend naming.
