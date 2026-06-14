# Plan 10: Async Notifications, Analytics, And Operations

## Required Context Bundle

Give the implementation agent exactly these two files:

1. `golden-years-server-next/README.md`
2. `golden-years-server-next/10-async-notifications-analytics-and-ops.plan.md`

The README is the source of truth for whole-system architecture, shared vocabulary, and safety rules. This file is the step-specific plan.

## Step Context

Emails, notification fanout, analytics rollups, search projection sync, media callbacks, stale availability sweeps, and retries should not run as fragile request-handler side effects. This step builds queue and cron consumers around the Postgres outbox and platform adapters.

## Goal

Implement Cloudflare Queue and Cron entrypoints, outbox dispatch/retry logic, notification fanout, email delivery adapter, analytics rollups, search projection sync hooks, media callbacks, availability staleness sweeps, and operational diagnostics.

## Proposed Files

```text
apps/api/src/entrypoints/queue.ts
apps/api/src/entrypoints/cron.ts
apps/api/src/platform/queue/cloudflareQueueAdapter.ts
apps/api/src/platform/email/resendEmailAdapter.ts
apps/api/src/platform/email/emailTemplateRenderer.ts
apps/api/src/application/outbox/outboxDispatcher.ts
apps/api/src/application/notifications/notificationFanoutService.ts
apps/api/src/application/email/emailDeliveryService.ts
apps/api/src/application/analytics/analyticsRollupService.ts
apps/api/src/application/search/searchProjectionSyncService.ts
apps/api/src/application/media/mediaCallbackService.ts
apps/api/src/application/availability/availabilityStalenessService.ts
apps/api/src/application/ops/diagnosticsService.ts
apps/api/src/db/repositories/emailDeliveryRepository.ts
apps/api/src/db/repositories/analyticsRollupRepository.ts
apps/api/src/entrypoints/queue.bdd.test.ts
apps/api/src/entrypoints/cron.bdd.test.ts
apps/api/src/application/outbox/*.bdd.test.ts
```

## BDD Scenarios

```gherkin
Feature: Outbox delivery
Scenario: Pending outbox events are delivered and marked complete
  Given pending outbox events exist
  When the queue consumer processes the batch
  Then each successful event is marked delivered
  And provider delivery IDs or downstream message IDs are recorded when available
```

```gherkin
Feature: Outbox retry
Scenario: Transient failures are retried with bounded attempts
  Given an outbox event delivery fails with a transient provider error
  When the dispatcher handles the failure
  Then the event attempt count increases
  And next_retry_at is scheduled
  And the event is not lost or marked delivered
```

```gherkin
Feature: Notification and email fanout
Scenario: Tour confirmation emits in-app notification and transactional email
  Given a tour confirmation domain event exists in the outbox
  When notification fanout processes the event
  Then an in-app notification snapshot is stored
  And an email delivery job is created with a safe template snapshot
```

```gherkin
Feature: Analytics rollups
Scenario: Daily facility metrics exclude raw sensitive payloads
  Given analytics events for facility views, clicks, recommendations, and tour conversions
  When the daily rollup cron runs
  Then facility_daily_metrics are updated
  And raw PII, care notes, and assessment answers are not copied into rollup tables
```

```gherkin
Feature: Availability staleness
Scenario: Stale availability is detected by cron
  Given a facility availability update is older than the freshness window
  When the availability staleness sweep runs
  Then the public projection marks availability as stale
  And a provider/admin reminder event is queued if configured
```

```gherkin
Feature: Idempotent queue processing
Scenario: Duplicate queue delivery does not duplicate side effects
  Given the same queue message is delivered twice
  When the consumer processes both deliveries
  Then email, notification, and projection side effects are applied once
  And duplicate handling is observable in logs or diagnostics
```

## Implementation Notes

- Queue messages should reference durable outbox IDs, not carry the only copy of business payloads.
- Email templates are rendered server-side from stored event snapshots. Never compose production emails in frontend code.
- Store provider message IDs, attempts, last error, timestamps, and suppression/bounce data.
- Cron should handle retries, analytics rollups, stale availability, and projection repair jobs.
- Keep diagnostics private to authorized admin/ops callers and redact sensitive payloads.

## Non-Goals

- No public UI or frontend implementation.
- No full email template admin.
- No dedicated external search engine.
- No data warehouse export.
- No long-running CPU-heavy image transformation pipeline.

## Acceptance Criteria

- All BDD scenarios pass as automated tests.
- Queue and Cron entrypoints use shared application services and platform adapters.
- Outbox processing is retry-safe and idempotent.
- Notification and email side effects are durable and auditable.
- Analytics rollups avoid sensitive raw payloads.
- Operational diagnostics expose safe status for authorized users.
