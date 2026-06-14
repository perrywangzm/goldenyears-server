# Plan 06 Progress

## Status

Implemented for the Family MVP subset only.

## Implemented

- `list_saved_facilities`
- `create_saved_facility`
- `delete_saved_facility`
- `create_tour_request`
- `list_tour_requests`
- `get_account_dashboard`
- Family-owned saved facility service.
- Tour request service with audit, outbox, and `Idempotency-Key` support.
- Minimal account dashboard counts and recent tour request summaries.

## BDD Coverage

- Saves are owned by the authenticated family user.
- Duplicate tour submissions with the same `Idempotency-Key` return the original response and create one row/outbox event.
- Actor context is backend-derived, not body-derived.

## Deferred

- No review submission.
- No notification inbox workflow.
- No provider manager transitions.
- No email delivery, queue consumers, shortlists, assessment, or cost calculator persistence.
