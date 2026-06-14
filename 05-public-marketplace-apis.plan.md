# Plan 05: Public Marketplace APIs

## Required Context Bundle

Give the implementation agent exactly these two files:

1. `golden-years-server-next/README.md`
2. `golden-years-server-next/05-public-marketplace-apis.plan.md`

The README is the source of truth for whole-system architecture, shared vocabulary, and safety rules. This file is the step-specific plan.

## Step Context

The public marketplace is the first user-visible backend surface: homepage, search, facility detail, public reviews, articles, recommendations, and reference filters. These APIs must return frontend-ready projections while enforcing public/private data separation.

## Goal

Implement public marketplace read APIs and analytics ingestion using standard API conventions, projection-complete DTOs, Postgres search/filtering, and safe optional personalization.

## Proposed Files

```text
apps/api/src/interface/routes/marketplace.route.ts
apps/api/src/interface/schemas/marketplace.schema.ts
apps/api/src/application/facilities/facilityReadService.ts
apps/api/src/application/search/facilitySearchService.ts
apps/api/src/application/reference/referenceService.ts
apps/api/src/application/recommendations/recommendationService.ts
apps/api/src/application/articles/articleReadService.ts
apps/api/src/application/analytics/analyticsIngestionService.ts
apps/api/src/domain/availability/availabilityFreshness.ts
apps/api/src/domain/pricing/monthlyEquivalent.ts
apps/api/src/domain/search/searchFilters.ts
apps/api/src/domain/recommendations/homepageRanking.ts
apps/api/src/db/repositories/facilitySearchRepository.ts
apps/api/src/db/repositories/articleRepository.ts
apps/api/src/db/repositories/analyticsRepository.ts
apps/api/src/interface/routes/marketplace.bdd.test.ts
apps/api/src/application/facilities/*.bdd.test.ts
```

## BDD Scenarios

```gherkin
Feature: Public facility search
Scenario: Search returns card and map projections without private fields
  Given approved public facilities and non-public facilities exist
  When a visitor calls search_facilities with filters, sort, and cursor page
  Then only approved enabled public facilities are returned
  And each item includes facility card fields, availability freshness, price summary, rating counts, and map marker data when coordinates exist
  And private provider, admin, moderation, and audit fields are absent
```

```gherkin
Feature: Search filtering
Scenario: Standard filter DSL maps to indexed search criteria
  Given facilities with care types, regions, features, languages, prices, availability, and coordinates
  When a visitor searches with structured filters and map bounds
  Then the result set respects the filters
  And unsupported filter fields or operators fail with validation_failed
```

```gherkin
Feature: Facility detail
Scenario: Detail response is complete for the frontend listing page
  Given an approved public facility with reviews, media, care types, features, languages, price, trust badges, and tour availability
  When a visitor calls get_facility
  Then the response includes a safe detail projection
  And the frontend does not need additional per-section facility calls to render the page
```

```gherkin
Feature: Homepage recommendations
Scenario: Signed-in users receive safe saved-affinity recommendations
  Given a signed-in family user with saved facilities
  When the user calls get_homepage
  Then recommendations prefer matching care types where available
  And saved facilities are excluded when requested
  And the response includes a recommendationRequestId for attribution
```

```gherkin
Feature: Analytics ingestion
Scenario: Public analytics events are accepted without sensitive payloads
  Given a visitor submits a search or recommendation click event
  When create_analytics_event is called
  Then the event is stored with request metadata and safe attribution fields
  And raw PII, care notes, and sensitive assessment answers are rejected or redacted
```

## Implementation Notes

- Use the operation names implied by this plan's routes and schemas; the authoritative endpoint rules live in the README and copied conventions.
- Public reads may be unauthenticated, but if a session exists they may decorate saved state safely.
- Search should start with Postgres full-text, trigram, indexed filters, and PostGIS.
- Recommendation ranking must not use paid placement or subscription tier.
- Article APIs can start as imported/static records but should use backend-owned tables and slugs.
- Register server cache allowlist entries only for safe read operations.

## Non-Goals

- No facility manager editing.
- No admin approval/rejection workflows.
- No review submission.
- No dedicated search engine.
- No CMS authoring interface beyond read-side article support.

## Acceptance Criteria

- All BDD scenarios pass as automated tests.
- Public endpoints follow copied `API_CONVENTIONS.md`.
- Read DTOs are projection-complete for React Query/viewmodel consumption.
- Public APIs exclude private and operational fields.
- Search supports standard pagination and filter validation.
- Cache and invalidation metadata exists for marketplace reads where eligible.
