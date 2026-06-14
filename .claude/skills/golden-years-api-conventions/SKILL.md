---
name: golden-years-api-conventions
description: Enforce Golden Years backend API conventions when designing, implementing, or reviewing server endpoints, OpenAPI schemas, generated clients, cache metadata, invalidation tags, and frontend React Query contracts.
---

# Golden Years API Conventions

Use this skill whenever you touch Golden Years backend endpoints, OpenAPI contracts, generated clients, API mocks, React Query integration metadata, or contract tests.

## Required Reference

Read `golden-years-server-next/API_CONVENTIONS.md` before implementing or reviewing API behavior. It is the full source of truth. This skill is the working checklist.

## Endpoint Checklist

- Use `POST` and `application/json` for every endpoint, including reads.
- Use `/api/v{N}/{verb}_{resource}`.
- Use snake_case endpoint names.
- Use no path params and no query params.
- Put all endpoint input in the JSON body.
- Derive auth, tenant, role, actor, and facility membership from server-side session context, never from body fields.
- Return exactly one top-level success or error shape: `{ "data": ... }` or `{ "error": ... }`.
- Use stable snake_case `error.code` values.
- Include and echo/generate `X-Request-Id`.
- Generate OpenAPI from the same route schemas the server validates.
- Set OpenAPI `operationId` equal to the endpoint name.

## Request Shape Rules

- `get_*` and `delete_*`: body contains `id` unless the operation is intentionally current-principal scoped, such as `get_me`.
- `list_*` and `search_*`: support standard `filters`, `sort`, `page`, and `fields` keys.
- `create_*`: returns the created resource and supports `Idempotency-Key` when duplicate submission is plausible.
- `update_*`: partial patch; absent fields stay unchanged and explicit `null` clears nullable fields.
- `replace_*`: full replacement.
- `delete_*`: idempotent success for already-deleted records unless the product contract says otherwise.
- `batch_*`: return per-item `{ ok, data | error }` results.

## Workflow Transition Rule

Use one operation per business transition. Prefer transition resources like:

```text
create_tour_request_confirmation
create_tour_request_decline
create_listing_submission_approval
create_review_flag_resolution
```

Do not build one generic endpoint that branches on a free-form `action` body field.

## Cache And React Query Metadata

- Reads are not server-cached unless explicitly registered in the allowlist.
- Cache keys are derived from endpoint, principal scope, and canonical JSON body.
- Mutations are never cached.
- Mutations declare invalidation tags with `x-goldenyears-invalidates`.
- Cacheable reads declare dependencies with `x-goldenyears-cache`.
- Query-facing read responses should be projection-complete to avoid frontend waterfalls.

## Safety Rules

- Public DTOs must not leak provider emails, admin notes, audit trails, moderation flags, private media originals, or facility manager metadata.
- Privileged endpoints require backend authorization policy checks.
- Sensitive request payloads should be redacted in logs.
- Mutations touching business records should share one transaction for data changes, audit rows, outbox rows, and idempotency results.

## Codex Compatibility

The canonical skill is this Claude skill. Codex may use it only through the symlinked path:

```text
golden-years-server-next/.codex/skills/golden-years-api-conventions
```

Do not duplicate this skill into `.codex/skills`.
