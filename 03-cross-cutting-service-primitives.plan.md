# Plan 03: Cross-Cutting Service Primitives

## Required Context Bundle

Give the implementation agent exactly these two files:

1. `golden-years-server-next/README.md`
2. `golden-years-server-next/03-cross-cutting-service-primitives.plan.md`

The README is the source of truth for whole-system architecture, shared vocabulary, and safety rules. This file is the step-specific plan.

## Step Context

Every Golden Years workflow needs the same correctness primitives: request context, errors, filters, pagination, transactions, idempotency, audit, outbox, cache metadata, logging, and redaction. This step creates those shared tools once so product modules do not invent local variants.

## Goal

Implement reusable primitives for service commands, transaction execution, idempotency, audit, outbox, filter DSL parsing, pagination, cache registration, structured logging, and sensitive-data redaction.

## Proposed Files

```text
apps/api/src/shared/request-context/context.ts
apps/api/src/shared/errors/domainError.ts
apps/api/src/shared/errors/errorCodes.ts
apps/api/src/shared/transactions/transactionRunner.ts
apps/api/src/shared/idempotency/idempotencyService.ts
apps/api/src/shared/audit/auditWriter.ts
apps/api/src/shared/outbox/outboxWriter.ts
apps/api/src/shared/filters/filterDsl.ts
apps/api/src/shared/filters/filterDsl.schema.ts
apps/api/src/shared/pagination/cursor.ts
apps/api/src/shared/pagination/page.schema.ts
apps/api/src/shared/cache/cacheRegistry.ts
apps/api/src/shared/cache/canonicalJson.ts
apps/api/src/shared/logging/logger.ts
apps/api/src/shared/logging/redaction.ts
apps/api/src/shared/testing/builders.ts
apps/api/src/shared/**/*.bdd.test.ts
```

## BDD Scenarios

```gherkin
Feature: Idempotent mutations
Scenario: Repeated create commands return the original result
  Given a create command is executed with an Idempotency-Key
  When the same command is repeated within the retention window
  Then the original response is returned
  And no duplicate business row is created
```

```gherkin
Feature: Atomic workflow side effects
Scenario: Business change, audit, and outbox commit together
  Given an application service writes a business change, an audit event, and an outbox event
  When the transaction commits
  Then all three records are visible
  And if the outbox write fails then the business change is rolled back
```

```gherkin
Feature: Filter DSL validation
Scenario: Unsupported filter operators are rejected
  Given a list request body with filters using an unknown operator
  When the filter DSL parser validates the body
  Then validation fails with error code validation_failed
  And no SQL predicate is generated from the unknown operator
```

```gherkin
Feature: Cursor pagination
Scenario: Cursors are opaque and tied to request shape
  Given a first page request with filters and sort
  When a cursor is generated
  Then the cursor cannot be interpreted by clients
  And using it with different filters or sort fails with validation_failed
```

```gherkin
Feature: Sensitive log redaction
Scenario: Sensitive fields are removed from structured logs
  Given a request body includes phone, email, care notes, assessment answers, and income inputs
  When the logger serializes request context
  Then the sensitive field values are redacted
  And stable non-sensitive metadata remains available for debugging
```

## Implementation Notes

- Keep primitives framework-light so application services can use them without Hono imports.
- Idempotency stores both success and controlled failure responses for safe replay.
- Audit writer should accept actor, action, resource, before/after diff, source, and notes metadata.
- Outbox writer should store event type, aggregate type/id, payload snapshot, status, attempts, and next retry time.
- Filter DSL should compile to a typed intermediate predicate that repositories can translate to SQL.
- Cache registry should support both server cache allowlist metadata and OpenAPI extension generation.

## Non-Goals

- No product-specific endpoints.
- No role/facility membership policy implementation.
- No queue consumer delivery logic.
- No vendor email/media/geocoding adapters.

## Acceptance Criteria

- All BDD scenarios pass as automated tests.
- Application services can run mutation workflows through one transaction helper.
- Filter, pagination, cache, idempotency, audit, and outbox APIs are typed and reusable.
- Logging helpers redact known sensitive fields by default.
- OpenAPI metadata can consume cache and invalidation declarations from one registry.
