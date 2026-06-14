# Plan 04: Auth, RBAC, And Sessions

## Required Context Bundle

Give the implementation agent exactly these two files:

1. `golden-years-server-next/README.md`
2. `golden-years-server-next/04-auth-rbac-sessions.plan.md`

The README is the source of truth for whole-system architecture, shared vocabulary, and safety rules. This file is the step-specific plan.

## Step Context

Auth is the root of every private workflow: family saves, tour tracking, review eligibility, provider management, admin review, CMS publication, and audit attribution. This step implements application-owned sessions and centralized authorization policies.

## Goal

Implement secure browser sessions, current-user APIs, auth lifecycle endpoints, role and facility-membership authorization, CSRF protection, and auth-related rate-limit hooks.

## Proposed Files

```text
apps/api/src/interface/routes/auth.route.ts
apps/api/src/interface/routes/me.route.ts
apps/api/src/interface/middleware/session.ts
apps/api/src/interface/middleware/csrf.ts
apps/api/src/application/auth/authService.ts
apps/api/src/application/auth/sessionService.ts
apps/api/src/application/auth/passwordService.ts
apps/api/src/application/auth/emailVerificationService.ts
apps/api/src/shared/authz/policies.ts
apps/api/src/shared/authz/capabilities.ts
apps/api/src/shared/authz/facilityMembershipPolicy.ts
apps/api/src/db/repositories/sessionRepository.ts
apps/api/src/db/repositories/facilityMembershipRepository.ts
apps/api/src/platform/rate-limit/authRateLimiter.ts
apps/api/src/application/auth/*.bdd.test.ts
apps/api/src/shared/authz/*.bdd.test.ts
```

## BDD Scenarios

```gherkin
Feature: Browser session authentication
Scenario: Login creates a secure session and get_me returns safe user context
  Given a verified family user with valid credentials
  When the user calls create_session
  Then the response sets an HTTP-only Secure SameSite cookie
  And a later get_me response returns the safe user object, roles, saved count, unread notification count, managed facility count, and review invite count
```

```gherkin
Feature: Auth context integrity
Scenario: Body actor fields cannot impersonate another user
  Given an authenticated family user
  When the user calls a protected endpoint with user_id or actor_id in the body
  Then the service derives the actor from the session
  And the body identity fields are ignored or rejected according to the endpoint schema
```

```gherkin
Feature: Facility membership authorization
Scenario: Facility managers can act only on managed facilities
  Given a facility manager belongs to facility A but not facility B
  When the manager attempts to update availability for facility B
  Then the request fails with forbidden
  And no audit or business record is written for facility B
```

```gherkin
Feature: CSRF protection
Scenario: Cookie-authenticated mutations require a valid CSRF signal
  Given a valid browser session cookie
  When a mutation request omits the required CSRF token or header
  Then the response fails with forbidden
  And the mutation service is not executed
```

```gherkin
Feature: Rate-limited auth flows
Scenario: Repeated failed login attempts are throttled
  Given multiple failed create_session attempts for the same account or IP bucket
  When the threshold is exceeded
  Then later attempts fail with rate_limited
  And details.retry_after_ms is included
```

## Implementation Notes

- Use HTTP-only Secure SameSite cookies for browser sessions.
- Keep password hashing, token generation, and secret access behind small utilities or adapters.
- Role list is `family`, `facility_manager`, `admin`, `moderator`, and `cms_editor`.
- Facility access is membership-table based. Never use provider email equality as authorization.
- `get_me` should be projection-backed and safe for the frontend nav/session provider.
- Preserve a future Supabase Auth switch by keeping app profiles, roles, memberships, and policies backend-owned.

## Non-Goals

- No social login.
- No Supabase Auth integration.
- No UI implementation.
- No provider onboarding or admin workflow endpoints beyond authorization policies needed for tests.

## Acceptance Criteria

- All BDD scenarios pass as automated tests.
- Session cookies use secure production attributes.
- Auth endpoints follow copied `API_CONVENTIONS.md`.
- Authorization policies are centralized and reusable by application services.
- Auth logs and audit metadata do not contain raw passwords, reset tokens, or verification tokens.
