# Plan 06: Family Workflow APIs

## Required Context Bundle

Give the implementation agent exactly these two files:

1. `golden-years-server-next/README.md`
2. `golden-years-server-next/06-family-workflows-apis.plan.md`

The README is the source of truth for whole-system architecture, shared vocabulary, and safety rules. This file is the step-specific plan.

## Step Context

Family workflows move Golden Years from browsing to action: saved facilities, tour requests, account dashboard, notifications, and verified reviews. These are sensitive, duplicate-prone, and stateful, so they need idempotency, authorization, audit, and clear transition contracts.

## Goal

Implement family-owned saved facilities, tour request lifecycle APIs, account dashboard, review eligibility/submission, and notification read APIs with backend-owned rules and React Query-friendly invalidation metadata.

## Proposed Files

```text
apps/api/src/interface/routes/family.route.ts
apps/api/src/interface/schemas/family.schema.ts
apps/api/src/application/account/accountDashboardService.ts
apps/api/src/application/saved/savedFacilityService.ts
apps/api/src/application/tours/tourRequestService.ts
apps/api/src/application/reviews/reviewSubmissionService.ts
apps/api/src/application/notifications/notificationReadService.ts
apps/api/src/domain/tour-state/tourStateMachine.ts
apps/api/src/domain/tour-state/tourSlotEligibility.ts
apps/api/src/domain/review-eligibility/reviewEligibility.ts
apps/api/src/db/repositories/savedFacilityRepository.ts
apps/api/src/db/repositories/notificationRepository.ts
apps/api/src/interface/routes/family.bdd.test.ts
apps/api/src/domain/tour-state/*.bdd.test.ts
apps/api/src/domain/review-eligibility/*.bdd.test.ts
```

## BDD Scenarios

```gherkin
Feature: Saved facilities
Scenario: Saves are owned by the authenticated family user
  Given a signed-in family user and an approved public facility
  When the user calls create_saved_facility
  Then the facility appears in list_saved_facilities for that user
  And another user cannot delete that save by sending the first user's id in the body
```

```gherkin
Feature: Tour request creation
Scenario: Duplicate tour submissions are idempotent
  Given a family user submits a valid tour request with an Idempotency-Key
  When the same request is submitted again with the same key
  Then only one tour_request row exists
  And the same response is returned to the client
  And a notification outbox event is recorded once
```

```gherkin
Feature: Tour request transitions
Scenario: Invalid state transitions return conflict
  Given a tour request is in declined status
  When a manager or admin attempts to mark it attended
  Then the request fails with conflict
  And the tour request status is unchanged
```

```gherkin
Feature: Verified reviews
Scenario: One verified review is allowed after an attended tour
  Given a family user has an attended tour for a facility and no existing review for that tour
  When the user calls create_review
  Then a verified public review is created
  And a second create_review for the same tour fails with conflict
```

```gherkin
Feature: Notification inbox
Scenario: Read state updates affect only the authenticated user's notifications
  Given a family user has unread notifications
  When the user calls update_notification_read_state
  Then the selected notifications are marked read for that user
  And notifications owned by other users are not modified
```

## Implementation Notes

- Tour request status flow is `pending_review -> confirmed`, `pending_review -> declined`, `confirmed -> attended`, `confirmed -> no_show`, and `confirmed -> cancelled`.
- Tour creation and review submission are duplicate-prone and require idempotency.
- Guest tour/assessment claim can be modeled as a service boundary even if full guest claim UX lands later.
- Use outbox events for notification and email side effects.
- Invalidation tags should include `facility`, `tour_request`, `review`, `notification`, `account`, and `saved_facility` where appropriate.

## Non-Goals

- No provider onboarding or facility manager dashboard UI endpoints beyond tour transition commands needed by family workflows.
- No admin moderation of reviews.
- No cost calculator, assessment persistence, or shared shortlists.
- No email provider delivery implementation.

## Acceptance Criteria

- All BDD scenarios pass as automated tests.
- Family endpoints follow copied `API_CONVENTIONS.md`.
- Tour and review rules live in domain services, not route handlers.
- Mutations write audit/outbox/idempotency records where required.
- Read endpoints return frontend-ready dashboard, save, tour, review, and notification projections.
