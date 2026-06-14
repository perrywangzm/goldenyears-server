# Plan 01: Worker Foundation And API Interface

## Required Context Bundle

Give the implementation agent exactly these two files:

1. `golden-years-server-next/README.md`
2. `golden-years-server-next/01-worker-foundation-and-api-interface.plan.md`

The README is the source of truth for whole-system architecture, shared vocabulary, and safety rules. This file is the step-specific plan.

## Step Context

This step creates the Workers/Hono API shell that every later module depends on. It locks in request validation, response envelopes, OpenAPI generation, middleware order, and contract checks before business modules start shipping endpoints.

## Goal

Implement the backend HTTP foundation with Hono, Zod, OpenAPI generation, standard middleware, and a minimal health/current-context route proving the API conventions.

## Proposed Files

```text
apps/api/package.json
apps/api/tsconfig.json
apps/api/wrangler.jsonc
apps/api/src/entrypoints/http.ts
apps/api/src/interface/app.ts
apps/api/src/interface/openapi/registry.ts
apps/api/src/interface/openapi/exportOpenApi.ts
apps/api/src/interface/middleware/requestContext.ts
apps/api/src/interface/middleware/enforceJsonPost.ts
apps/api/src/interface/middleware/errorEnvelope.ts
apps/api/src/interface/middleware/securityHeaders.ts
apps/api/src/interface/routes/health.route.ts
apps/api/src/interface/routes/me.route.ts
apps/api/src/shared/errors/apiError.ts
apps/api/src/shared/envelopes/envelope.ts
apps/api/src/shared/testing/httpTestClient.ts
apps/api/src/interface/app.bdd.test.ts
tools/openapi/checkApiConventions.ts
```

## BDD Scenarios

```gherkin
Feature: API transport conventions
Scenario: A valid POST JSON request receives a data envelope
  Given the Worker API is running
  When a client posts JSON to /api/v1/get_health
  Then the response status is 200
  And the response body has a data object
  And the response includes X-Request-Id
```

```gherkin
Feature: API transport conventions
Scenario: Non-POST requests are rejected consistently
  Given the Worker API is running
  When a client sends GET to /api/v1/get_health
  Then the response status is 405 or 400 according to the middleware contract
  And the response body has an error envelope with code bad_request
```

```gherkin
Feature: OpenAPI convention checks
Scenario: Generated OpenAPI operations follow Golden Years conventions
  Given the OpenAPI document is generated from route schemas
  When the convention checker runs
  Then every browser API operation uses POST
  And no operation declares path or query parameters
  And every operationId equals its endpoint name
```

```gherkin
Feature: Error normalization
Scenario: Unknown exceptions become safe internal errors
  Given a route throws an unexpected exception
  When the API middleware handles the exception
  Then the response body has error.code internal_error
  And sensitive details are not returned
  And the request ID is preserved for support
```

## Implementation Notes

- Use Hono's Workers entrypoint shape.
- Use Zod schemas as the route validation source and OpenAPI generation source.
- Keep route handlers thin and use placeholder services only where needed to prove wiring.
- Add a convention checker that can run in CI and fail on method/path/query/envelope drift.
- Configure CORS for known app origins through environment config, but keep local development ergonomic.

## Non-Goals

- No real auth implementation beyond a stubbed anonymous/current-context route.
- No database access.
- No business modules beyond health and current context proof routes.
- No queue, cron, or R2 implementation.

## Acceptance Criteria

- All BDD scenarios pass as automated tests.
- OpenAPI JSON can be generated deterministically.
- Standard envelopes and errors are reusable by later steps.
- Middleware enforces POST JSON conventions.
- The health route proves the Worker can run locally under the chosen test runtime.
