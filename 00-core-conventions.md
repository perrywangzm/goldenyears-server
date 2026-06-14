# Core Conventions

## Canonical Choices

- Runtime: Cloudflare Workers.
- Router: Hono.
- Language: TypeScript strict.
- Validation: Zod at the API boundary and domain-specific validation in services.
- API contract: REST-style operations over `POST /api/v1/{verb_resource}` with OpenAPI generation.
- Database: Supabase Postgres in Singapore, accessed through Cloudflare Hyperdrive.
- Hyperdrive origin: Supabase **session pooler** (`*.pooler.supabase.com:5432`). Do not use transaction pooler (`:6543`) — `pg`/Kysely DB routes hang. See `docs/deployment/environment-variables.md`.
- SQL layer: Kysely plus SQL migrations.
- Search: Postgres full-text, trigram indexes, and PostGIS for v1.
- Media: Cloudflare R2 with private originals and approved public variants.
- Async: Postgres outbox plus Cloudflare Queues and Cron.
- Auth: application-owned HTTP-only cookie sessions unless leadership explicitly switches to Supabase Auth.

## API Rules

The copied `API_CONVENTIONS.md` in this folder is authoritative.

- All endpoints use `POST` with `application/json`.
- No path params and no query params.
- URL shape is `/api/v{N}/{verb}_{resource}`.
- Responses are exactly `{ "data": ... }` or `{ "error": ... }`.
- `filters`, `sort`, `page`, and `fields` use the standard list/search body shape.
- Auth, tenancy, role, and actor identity are never read from body fields.
- Create operations that can duplicate real-world actions support `Idempotency-Key`.
- Mutations declare invalidation tags.
- Reads are not cached unless registered in the cache allowlist.

## Operation Naming

Use the endpoint name as the OpenAPI `operationId`.

Examples:

```text
POST /api/v1/get_me
POST /api/v1/search_facilities
POST /api/v1/get_facility
POST /api/v1/create_tour_request
POST /api/v1/create_tour_request_confirmation
POST /api/v1/create_listing_submission_approval
POST /api/v1/list_admin_listing_submissions
```

For workflow transitions, prefer single-purpose `create_*` transition operations over one generic `update_*` endpoint with an `action` body field.

## Module Naming

- Directories use kebab-case where they are product modules: `facility-manager`, `cost-calculator`.
- TypeScript files use camelCase for services and helpers: `tourState.ts`, `availabilityFreshness.ts`.
- API schema files use `*.schema.ts`.
- Tests use `*.test.ts` or `*.bdd.test.ts`.
- SQL migrations use zero-padded timestamps or sequence prefixes.
- Public module exports come from `index.ts`; do not deep import another module's internals.

## Contract Style

Use explicit exported TypeScript types at boundaries:

- OpenAPI DTOs, envelopes, errors, operation IDs, and invalidation metadata.
- Application service commands and results.
- Domain service inputs/outputs when consumed across modules.
- Repository method inputs/outputs.
- Platform adapter ports.
- Test fixture builders and BDD scenario names.

Let TypeScript infer private helpers. Do not invent abstract interfaces with one implementation unless a platform adapter or parallel-agent boundary needs a stable port.

## Time, Money, IDs

- Store timestamps in UTC and include Singapore timezone context when scheduling requires it.
- Scheduling defaults to `Asia/Singapore`.
- Store money as integer minor units or `numeric`, never floating point.
- Public currency is SGD unless a policy schema says otherwise.
- Use internal UUID/ULID IDs and separate public slugs for shareable URLs.
- Use numeric `version` columns for optimistic concurrency on workflow-owned records.

## Claude And Codex Skills

The canonical API convention skill lives at:

```text
golden-years-server-next/.claude/skills/golden-years-api-conventions/SKILL.md
```

The Codex-facing path is a symlink:

```text
golden-years-server-next/.codex/skills/golden-years-api-conventions
```

Do not create standalone Codex skill files. If a skill is needed by Codex, create or update the Claude skill first, then symlink it into `.codex/skills`.

## Testing Conventions

- Every implementation plan starts from BDD scenarios.
- API behavior is tested at the HTTP boundary with generated schemas when possible.
- Domain rules are tested as pure units.
- Repository tests use migrated test databases or isolated transaction fixtures.
- Queue/Cron handlers are tested through fake platform adapters and outbox rows.
- Contract checks fail if OpenAPI operation IDs, envelopes, error codes, or invalidation metadata drift from the conventions.
