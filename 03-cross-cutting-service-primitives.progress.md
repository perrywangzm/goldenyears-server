# Plan 03 Progress

## Status

Implemented for primitives needed by the first milestone.

## Implemented

- Request context and actor context types.
- API/domain error classes and error code registry.
- Transaction runner abstraction.
- Filter DSL validation and typed predicate flattening.
- Offset page schemas and cursor helpers bound to request shape.
- Idempotency service with request hashing and replay for duplicate-prone creates.
- Audit writer and outbox writer.
- Cache/invalidation metadata registry primitives.
- Structured logging and sensitive-field redaction.
- Test builders for service-level BDD tests.

## BDD Coverage

- Idempotent create replay.
- Atomic workflow side-effect behavior through transaction runner tests.
- Unsupported filter operators return `validation_failed`.
- Cursor request-shape binding.
- Sensitive log redaction.

## Deferred

- Queue consumers, cron jobs, email delivery, and vendor adapters remain out of scope.
