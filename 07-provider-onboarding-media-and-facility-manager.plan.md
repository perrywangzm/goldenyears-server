# Plan 07: Provider Onboarding, Media, And Facility Manager APIs

## Required Context Bundle

Give the implementation agent exactly these two files:

1. `golden-years-server-next/README.md`
2. `golden-years-server-next/07-provider-onboarding-media-and-facility-manager.plan.md`

The README is the source of truth for whole-system architecture, shared vocabulary, and safety rules. This file is the step-specific plan.

## Step Context

Providers need a controlled way to submit listings, upload media, manage availability, handle tours, and respond to reviews. These workflows must reduce staff load while preserving public trust and admin control over sensitive listing fields.

## Goal

Implement provider onboarding draft/submission APIs, R2 media upload authorization, managed-facility read APIs, bounded facility manager edits, availability updates, tour inbox actions, review responses, and review flags.

## Proposed Files

```text
apps/api/src/interface/routes/provider.route.ts
apps/api/src/interface/schemas/provider.schema.ts
apps/api/src/application/onboarding/listingSubmissionService.ts
apps/api/src/application/media/mediaUploadService.ts
apps/api/src/application/facility-manager/facilityManagerDashboardService.ts
apps/api/src/application/facility-manager/facilityManagerEditService.ts
apps/api/src/application/facility-manager/facilityManagerTourService.ts
apps/api/src/application/reviews/reviewResponseService.ts
apps/api/src/application/reviews/reviewFlagService.ts
apps/api/src/domain/listing-workflow/listingSubmissionRules.ts
apps/api/src/domain/availability/availabilityUpdateRules.ts
apps/api/src/platform/media/r2MediaAdapter.ts
apps/api/src/platform/media/mediaPolicy.ts
apps/api/src/db/repositories/listingSubmissionRepository.ts
apps/api/src/db/repositories/mediaAssetRepository.ts
apps/api/src/interface/routes/provider.bdd.test.ts
apps/api/src/application/media/*.bdd.test.ts
```

## BDD Scenarios

```gherkin
Feature: Provider listing submission
Scenario: Provider submits a listing without publishing it directly
  Given an authenticated provider user with valid submission data
  When the user calls create_listing_submission
  Then a listing submission is stored in pending_review status
  And no public facility projection is published
  And an admin notification outbox event is recorded
```

```gherkin
Feature: Media upload authorization
Scenario: Uploads are constrained by content policy and ownership
  Given an authenticated provider creating media for a managed submission or facility
  When the user calls create_media_upload with an allowed image content type and size
  Then the response returns an upload authorization for a private original object
  And disallowed content types or oversized files fail with validation_failed
```

```gherkin
Feature: Facility manager permissions
Scenario: Managers cannot edit facilities they do not manage
  Given a facility manager belongs to facility A but not facility B
  When the manager calls update_facility_availability for facility B
  Then the response fails with forbidden
  And no availability, audit, or outbox record is written
```

```gherkin
Feature: Bounded listing edits
Scenario: Low-risk manager edits can be saved without changing admin-owned fields
  Given a facility manager edits marketing copy, features, languages, availability, or public photos
  When update_facility_manager_listing_fields succeeds
  Then only allowed fields are changed
  And price, address, care types, facility name, licence state, and capacity remain unchanged unless admin-approved
```

```gherkin
Feature: Review responses and flags
Scenario: A facility manager can respond to and flag reviews for managed facilities
  Given a published review for a managed facility
  When the manager creates a facility review response and creates a review flag
  Then both records are associated with the managed facility
  And audit events are written for the response and flag
```

## Implementation Notes

- Keep originals private in R2 and expose only approved public variants through metadata.
- Media completion should verify object presence and expected metadata before making assets selectable.
- Facility manager access is membership-based.
- High-risk fields should route through listing submission/admin workflows rather than direct publish.
- Use audit and outbox for provider submissions, manager edits, tour actions, responses, and flags.

## Non-Goals

- No admin approval/rejection implementation.
- No image transformation pipeline beyond upload authorization and metadata.
- No rich analytics dashboard beyond manager-safe read placeholders.
- No real-time collaboration.

## Acceptance Criteria

- All BDD scenarios pass as automated tests.
- Provider endpoints follow copied `API_CONVENTIONS.md`.
- R2 access is isolated behind a media adapter.
- Facility manager edits are permission-checked and field-limited.
- Public projections change only when the workflow allows it.
