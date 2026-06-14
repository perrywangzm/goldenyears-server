# Plan 08: Admin, Moderation, CMS, And Audit APIs

## Required Context Bundle

Give the implementation agent exactly these two files:

1. `golden-years-server-next/README.md`
2. `golden-years-server-next/08-admin-moderation-cms-and-audit.plan.md`

The README is the source of truth for whole-system architecture, shared vocabulary, and safety rules. This file is the step-specific plan.

## Step Context

Admin and moderator workflows protect public trust: listing approval, rejection, disable/enable, licence verification, review flag resolution, CMS publication, and audit inspection. These APIs need strong authorization, transactional projections, and complete audit trails.

## Goal

Implement admin listing review, facility moderation, licence verification, review flag resolution, CMS article/static-page workflows, and audit query APIs.

## Proposed Files

```text
apps/api/src/interface/routes/admin.route.ts
apps/api/src/interface/routes/cms.route.ts
apps/api/src/interface/schemas/admin.schema.ts
apps/api/src/interface/schemas/cms.schema.ts
apps/api/src/application/admin/listingReviewService.ts
apps/api/src/application/admin/facilityModerationService.ts
apps/api/src/application/admin/licenceVerificationService.ts
apps/api/src/application/admin/reviewFlagResolutionService.ts
apps/api/src/application/admin/auditQueryService.ts
apps/api/src/application/cms/cmsArticleService.ts
apps/api/src/domain/listing-workflow/listingApprovalRules.ts
apps/api/src/domain/reviews/reviewModerationRules.ts
apps/api/src/domain/cms/cmsPublicationRules.ts
apps/api/src/db/repositories/adminListingRepository.ts
apps/api/src/db/repositories/cmsRepository.ts
apps/api/src/interface/routes/admin.bdd.test.ts
apps/api/src/interface/routes/cms.bdd.test.ts
```

## BDD Scenarios

```gherkin
Feature: Listing approval
Scenario: Admin approval publishes a safe public projection
  Given a pending listing submission with valid required fields
  When an admin calls create_listing_submission_approval
  Then the submission status becomes approved
  And a public facility projection is created or updated
  And audit and outbox records are written in the same transaction
```

```gherkin
Feature: Listing rejection
Scenario: Rejected submissions are never publicly visible
  Given a pending listing submission
  When an admin calls create_listing_submission_rejection with a reason
  Then the submission status becomes rejected
  And no public facility projection is created
  And the provider-facing rejection notification is queued through outbox
```

```gherkin
Feature: Facility disablement
Scenario: Disabled facilities disappear from public reads
  Given an approved public facility
  When an admin calls create_facility_disablement
  Then public search and detail APIs no longer return the facility
  And admin audit records capture actor, reason, and affected facility
```

```gherkin
Feature: Review flag resolution
Scenario: Moderators can resolve flags without exposing internal notes publicly
  Given a review flag is pending
  When a moderator calls create_review_flag_resolution
  Then the flag status and review visibility update according to moderation rules
  And internal notes are visible only to authorized admin/moderator APIs
```

```gherkin
Feature: CMS publication
Scenario: Published articles receive stable public slugs and versions
  Given a CMS editor has drafted an article
  When the editor calls create_cms_article_publication
  Then the article becomes visible through public article reads
  And the published version can be audited separately from later drafts
```

## Implementation Notes

- Admin actor is always derived from the authenticated session.
- Approval should rebuild or update public projections inside the same transaction as workflow status changes.
- Licence verification should be explicit and auditable; deleting verification means unverify, not deleting audit history.
- Audit query APIs must redact sensitive payload sections unless the caller has an explicit elevated scope.
- CMS can start with articles and static trust/provider pages; version content so published output is reproducible.

## Non-Goals

- No provider-facing UI.
- No full CMS rich text editor implementation.
- No public marketplace endpoint implementation except projection effects needed by tests.
- No external licence verification provider integration.

## Acceptance Criteria

- All BDD scenarios pass as automated tests.
- Admin, moderator, and CMS endpoints follow copied `API_CONVENTIONS.md`.
- Every privileged mutation writes audit records.
- Public projection changes are transactionally tied to approval/disablement/publication state.
- Internal notes and moderation fields are never returned by public APIs.
