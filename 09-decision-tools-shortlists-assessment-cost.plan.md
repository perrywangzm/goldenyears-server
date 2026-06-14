# Plan 09: Decision Tools, Shortlists, Assessment, And Cost APIs

## Required Context Bundle

Give the implementation agent exactly these two files:

1. `golden-years-server-next/README.md`
2. `golden-years-server-next/09-decision-tools-shortlists-assessment-cost.plan.md`

The README is the source of truth for whole-system architecture, shared vocabulary, and safety rules. This file is the step-specific plan.

## Step Context

Decision tools make Golden Years useful across multiple sessions and family members. Compare, assessment, cost estimates, and shortlists must move out of localStorage while preserving versioned policy logic, privacy, and collaboration safety.

## Goal

Implement backend APIs for compare summaries, assessment schema/scoring/results, cost calculator policy and estimates, owned shortlists, shared shortlist tokens, notes, reactions, and import-copy flow.

## Proposed Files

```text
apps/api/src/interface/routes/decisionTools.route.ts
apps/api/src/interface/schemas/decisionTools.schema.ts
apps/api/src/application/compare/compareService.ts
apps/api/src/application/assessment/assessmentService.ts
apps/api/src/application/cost-calculator/costCalculatorService.ts
apps/api/src/application/shortlists/shortlistService.ts
apps/api/src/application/shortlists/shortlistSharingService.ts
apps/api/src/domain/assessment/assessmentScoring.ts
apps/api/src/domain/cost-policy/costPolicyEngine.ts
apps/api/src/domain/shortlists/shortlistRevisionRules.ts
apps/api/src/domain/shortlists/shareTokenRules.ts
apps/api/src/db/repositories/assessmentRepository.ts
apps/api/src/db/repositories/costEstimateRepository.ts
apps/api/src/db/repositories/shortlistRepository.ts
apps/api/src/interface/routes/decisionTools.bdd.test.ts
apps/api/src/domain/assessment/*.bdd.test.ts
apps/api/src/domain/cost-policy/*.bdd.test.ts
apps/api/src/domain/shortlists/*.bdd.test.ts
```

## BDD Scenarios

```gherkin
Feature: Compare summary
Scenario: Compare uses safe facility projections for the authenticated user
  Given a family user has selected facilities to compare
  When the user calls get_compare_summary
  Then the response includes comparable public facility fields and normalized monthly prices
  And disabled or non-public facilities are omitted or marked unavailable according to the contract
```

```gherkin
Feature: Assessment results
Scenario: Assessment scoring is versioned and private to the owner
  Given a signed-in family user submits valid assessment answers
  When create_assessment_result is called
  Then a result is stored with the assessment schema version and scoring output
  And another user cannot read the result by sending the owner's id in the body
```

```gherkin
Feature: Cost estimates
Scenario: Cost calculations are reproducible from policy version
  Given a published cost calculator policy version
  When a user calls create_cost_estimate with valid household inputs
  Then the response includes calculation outputs and policy version
  And repeating the calculation later with the same stored version produces the same result
```

```gherkin
Feature: Shortlist collaboration
Scenario: Share tokens are opaque and scoped to a shortlist permission
  Given a user owns a shortlist
  When the user calls create_shortlist_share
  Then an opaque share token is created with expiry and permission metadata
  And callers without a valid token or membership cannot read private notes
```

```gherkin
Feature: Shortlist revision safety
Scenario: Concurrent shortlist edits detect stale versions
  Given two clients load the same shortlist version
  When both attempt conflicting updates
  Then the first update succeeds
  And the stale update fails with conflict and returns enough metadata for a refresh flow
```

## Implementation Notes

- Assessment answers and cost inputs are sensitive; redact logs and protect reads by owner/session.
- Persist schema and policy versions with results so outputs are reproducible.
- Shortlist share tokens must be opaque, revocable, and scoped.
- Use revision/version columns for shortlist conflict handling before considering real-time collaboration.
- Compare should consume public facility projections, not raw facility rows.

## Non-Goals

- No real-time collaborative editing.
- No payment or subsidy application submission.
- No policy admin UI.
- No machine-learning recommendations.
- No frontend state/store implementation.

## Acceptance Criteria

- All BDD scenarios pass as automated tests.
- Decision-tool endpoints follow copied `API_CONVENTIONS.md`.
- Sensitive inputs are redacted in logs and protected by authorization.
- Assessment and cost outputs are versioned and reproducible.
- Shortlist sharing uses opaque tokens and conflict-aware revisions.
