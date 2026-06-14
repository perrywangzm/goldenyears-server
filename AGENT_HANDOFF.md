# Agent Handoff Guide

Use this when assigning backend implementation work to an agent team.

## Standard Prompt

```text
Implement the assigned Golden Years backend step.

Read exactly these two files first:
1. golden-years-server-next/README.md
2. golden-years-server-next/NN-step-name.plan.md

Follow the BDD scenarios as the executable contract. Create a sibling progress file named NN-step-name.progress.md. Write failing tests for the scenarios before implementation. Keep to the Proposed Files and Non-Goals unless a scenario cannot pass without a small supporting file.

The critical architecture rule is that the backend owns product logic. Keep Hono handlers thin, put orchestration in application services, put pure rules in domain services, isolate SQL in repositories/migrations, and access vendors only through platform adapters.

Use API_CONVENTIONS.md for every endpoint. All browser APIs are POST JSON endpoints with data/error envelopes, stable operation IDs, server-derived auth context, and OpenAPI schemas.

When done, update the progress file with status, BDD coverage, decisions, and follow-ups.
```

## Suggested Parallelization

Safe early sequence:

1. Run `01-worker-foundation-and-api-interface.plan.md`.
2. Run `02-database-schema-migrations-and-repositories.plan.md`.
3. Run `03-cross-cutting-service-primitives.plan.md`.
4. Run `04-auth-rbac-sessions.plan.md`.

After those land, these can proceed mostly in parallel if ownership stays clean:

- `05-public-marketplace-apis.plan.md`
- `06-family-workflows-apis.plan.md`
- `07-provider-onboarding-media-and-facility-manager.plan.md`
- `08-admin-moderation-cms-and-audit.plan.md`
- `09-decision-tools-shortlists-assessment-cost.plan.md`

Run `10-async-notifications-analytics-and-ops.plan.md` once outbox primitives exist, but queue adapter work can start earlier behind fakes.

## Review Checklist

- Every endpoint follows copied `API_CONVENTIONS.md`.
- Every endpoint has OpenAPI request and response schemas.
- Hono handlers call application services rather than owning workflow logic.
- Mutations are transactional and include audit/outbox/idempotency where required.
- Authorization checks are centralized and tested.
- Public DTOs exclude private/provider/admin fields.
- Query-facing read DTOs are projection-complete.
- Mutations declare invalidation tags.
- Duplicate-prone creates support `Idempotency-Key`.
- Error envelopes preserve `X-Request-Id`.
- SQL stays in migrations, repositories, and projection builders.
- Platform vendors are behind adapters.
- `.codex/skills/*` entries are symlinks to `.claude/skills/*`, not standalone skills.
