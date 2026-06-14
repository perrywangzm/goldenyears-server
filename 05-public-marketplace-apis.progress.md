# Plan 05 Public Marketplace APIs Progress

## Implemented In This Milestone

- Added public marketplace endpoints under `/api/v1`:
  - `get_homepage`
  - `get_search_options`
  - `search_facilities`
  - `get_facility`
  - `list_facility_reviews`
  - `list_articles`
  - `get_article`
- Added safe public DTO schemas for homepage, search cards, facility detail, reviews, search options, and articles.
- Added public facility filtering, sort validation, map bounds support, availability freshness, and SGD price display helpers.
- Added simple homepage ranking that prefers care type affinity from saved facilities and excludes saved facilities when requested.
- Added BDD tests for public search privacy, filter validation, facility detail completeness, homepage recommendation behavior, reviews, and article reads.

## Explicitly Not Implemented

- No analytics ingestion.
- No paid placement, advanced personalization, or dedicated recommendation engine.
- No admin CMS authoring.
- No dedicated search engine.
- No DB schema changes.

## Contract Notes

- Endpoints are `POST` JSON-only and return standard `{ data }` or `{ data, page }` envelopes.
- Public facility DTOs intentionally omit provider emails, admin notes, moderation state, audit data, manager metadata, and private media originals.
- `search_facilities` accepts `filters`, `sort`, `page`, `fields`, and `map_bounds`; `fields` is accepted for contract compatibility but does not trim projection fields yet.
- Pagination is currently offset-based through the existing shared page resolver.
