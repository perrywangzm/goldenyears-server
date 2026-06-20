# API Conventions

This document defines the conventions every HTTP API in this project must follow. The goal is uniformity over REST purity: clients, SDKs, and codegen should be able to assume the same shape for every endpoint so we never re-litigate "method vs. body vs. query string" per route.

## TL;DR

- **Transport:** `POST` + `application/json` for every endpoint. No path params, no query params.
- **URL shape:** `/api/v{N}/{verb}_{resource}` — verb-first, snake_case, singular for single-item ops, plural for list ops.
- **Envelopes:** every response is `{ "data": ... }` on success or `{ "error": { ... } }` on failure.
- **Filtering:** structured operator objects with a closed vocabulary.
- **Pagination:** list/search endpoints support one of two explicit formats: cursor or offset.
- **Auth/tenancy:** never from the body — always from the auth token.
- **Caching:** opt-in allowlist at the application layer. Reads are not cached by default.

---

## 1. Transport

- All endpoints use `POST` with a JSON body, even reads.
- `Content-Type: application/json` required.
- `Accept: application/json` assumed.
- No path parameters. No query parameters. The body is the only input channel.
- HTTP status codes are used (`200`, `400`, `401`, `403`, `404`, `409`, `422`, `429`, `5xx`), but clients should branch on the `error.code` string, not the status.

**Trade-off accepted:** we lose HTTP-level GET caching (CDN, browser). This is an authenticated internal/product API; caching is handled at the application layer via an explicit allowlist — see §13.

---

## 2. URL & naming

```
/api/v{N}/{verb}_{resource}
```

Verb vocabulary (closed set):

| Verb        | Purpose                              | Resource form | Example                          |
| ----------- | ------------------------------------ | ------------- | -------------------------------- |
| `get_`      | Fetch one item by id                 | singular      | `/api/v1/get_facility`           |
| `list_`     | Query/filter many items              | plural        | `/api/v1/list_facilities`        |
| `search_`   | Full-text / ranked search            | plural        | `/api/v1/search_facilities`      |
| `create_`   | Create one item                      | singular      | `/api/v1/create_facility`        |
| `update_`   | Partial update (patch) of one item   | singular      | `/api/v1/update_facility`        |
| `replace_`  | Full replacement of one item         | singular      | `/api/v1/replace_facility`       |
| `delete_`   | Delete one item                      | singular      | `/api/v1/delete_facility`        |
| `batch_*`   | Bulk version of any of the above     | plural        | `/api/v1/batch_create_facilities`|

Rules:

- snake_case only.
- No nested resources in the path (`/facilities/123/reviews` ❌). Use a dedicated list operation instead (`list_facility_reviews` with the facility identifier in the body).
- One endpoint = one operation. Never overload by inspecting the body shape.

---

## 3. Request envelope

### 3.1 ID-based retrievers (`get_`, `delete_`)

```json
{ "id": "fac_31233213" }
```

### 3.2 List/search endpoints (`list_`, `search_`)

Every list/search endpoint accepts the same top-level keys. All are optional except where noted by the endpoint. Pagination has two supported formats; each endpoint must document whether it supports `cursor`, `offset`, or both.

```json
{
  "filters": { ... },
  "sort":    [ { "field": "created_at", "dir": "desc" } ],
  "page":    { "type": "cursor", "limit": 50, "cursor": "eyJvZmZzZXQiOjUwfQ==" },
  "fields":  ["id", "name", "price"]
}
```

- `filters` — see §4.
- `sort` — array of `{ field, dir }` where `dir` is `"asc"` or `"desc"`. Order matters.
- `page.type` — `"cursor"` or `"offset"`. If omitted, the endpoint's default applies.
- `page.limit` — integer, server enforces a max (default 50, max 200).
- `page.cursor` — cursor pagination only. Opaque string returned by the previous response. Omit on first page.
- `page.offset` — offset pagination only. Zero-based integer offset. Omit or set `0` on first page.
- `fields` — optional projection. If omitted, the server returns its default field set.

### 3.3 Create / Update / Replace

```json
// create_facility
{ "name": "Sunrise Home", "price": 10000 }

// update_facility — partial; only present fields are modified. Explicit null clears.
{ "id": "fac_31233213", "price": 12000 }

// replace_facility — full replacement; missing fields are reset to defaults.
{ "id": "fac_31233213", "name": "Sunrise Home", "price": 12000, "tags": [] }
```

### 3.4 Batch

```json
// batch_create_facilities
{ "items": [ { "name": "A", "price": 100 }, { "name": "B", "price": 200 } ] }
```

Batch responses always return a per-item result array (see §6.3). Batches are **not** transactional unless the endpoint explicitly documents otherwise.

---

## 4. Filter DSL

A `filters` value is a **predicate node**. A predicate node is one of:

1. A **field predicate**: `{ "<field>": { "<op>": <value>, ... } }`
2. A **boolean composition**: `{ "and": [ ... ] }`, `{ "or": [ ... ] }`, `{ "not": <predicate> }`

At the top level, multiple field predicates are implicitly AND-ed:

```json
{
  "filters": {
    "price":      { "gte": 100, "lte": 10000 },
    "name":       { "ilike": "abc%" },
    "created_at": { "gte": "2025-01-01T00:00:00Z", "lt": "2026-01-01T00:00:00Z" },
    "status":     { "in": ["active", "pending"] }
  }
}
```

Boolean composition example:

```json
{
  "filters": {
    "and": [
      { "price": { "gte": 100 } },
      { "or": [
        { "name": { "ilike": "abc%" } },
        { "tag":  { "eq": "vip" } }
      ] }
    ]
  }
}
```

### 4.1 Operator vocabulary (closed)

| Operator   | Meaning                          | Value type             |
| ---------- | -------------------------------- | ---------------------- |
| `eq`       | equal                            | scalar                 |
| `neq`      | not equal                        | scalar                 |
| `in`       | value in array                   | array of scalars       |
| `nin`      | value not in array               | array of scalars       |
| `gt`       | greater than                     | number / date string   |
| `gte`      | greater than or equal            | number / date string   |
| `lt`       | less than                        | number / date string   |
| `lte`      | less than or equal               | number / date string   |
| `like`     | case-sensitive pattern (`%`, `_`)| string                 |
| `ilike`    | case-insensitive pattern         | string                 |
| `is_null`  | null check                       | boolean                |

Adding a new operator requires updating this document.

### 4.2 Date & datetime values

- All datetimes are ISO 8601 in UTC: `"2025-01-01T00:00:00Z"`.
- Dates without time are `"2025-01-01"`.
- Server is responsible for indexing; clients should not pre-format ranges differently.

---

## 5. Sorting, pagination, projection

- **Sort:** stable; ties are broken by `id` ascending implicitly. Sorting on a non-indexed field is a server-side decision (may 400).
- **Pagination:** two formats are supported: cursor and offset. Cursor is preferred for large, mutable, user-facing collections. Offset is allowed for endpoints that are not naturally cursorable, admin/reporting views, small bounded sets, or integrations that require random page access.
- **Projection (`fields`):** dotted paths allowed for nested objects (`"owner.name"`). Server may ignore unknown fields silently or 422 — endpoint-specific, document per endpoint.

### 5.1 Cursor pagination

Use cursor pagination when the result set has a stable ordering and clients page forward through a changing collection.

Request:

```json
{
  "page": { "type": "cursor", "limit": 50, "cursor": "eyJvZmZzZXQiOjUwfQ==" }
}
```

Response:

```json
{
  "data": [ ... ],
  "page": { "type": "cursor", "next_cursor": "eyJvZmZzZXQiOjEwMH0=", "has_more": true }
}
```

Rules:

- `cursor` is opaque. Clients must not parse, construct, or modify it.
- Omit `cursor` on the first page.
- If `has_more` is `false`, `next_cursor` is `null`.
- Changing `filters`, `sort`, `fields`, or `limit` invalidates the cursor. Start a new pagination sequence.

### 5.2 Offset pagination

Use offset pagination when clients need random page access, when the dataset is small/bounded, or when the query cannot produce a stable cursor.

Request:

```json
{
  "page": { "type": "offset", "limit": 50, "offset": 100 }
}
```

Response:

```json
{
  "data": [ ... ],
  "page": { "type": "offset", "limit": 50, "offset": 100, "has_more": true }
}
```

Rules:

- `offset` is zero-based.
- Omit `offset` or send `0` on the first page.
- Clients request the next page with `offset + data.length`.
- If `has_more` is `false`, the current response is the last page.
- Total counts are optional. Endpoints may return `page.total_count` only when the count is cheap and useful.
- Offset pagination can duplicate or skip records when the underlying result set changes between requests. Use cursor pagination when this matters.

---

## 6. Response envelope

Every response has exactly one of `data` or `error` at the top level.

### 6.1 Single item

```json
{
  "data": { "id": "fac_31233213", "name": "Sunrise Home", "price": 12000 }
}
```

### 6.2 List/search

Cursor response:

```json
{
  "data": [ { "id": "fac_1", ... }, { "id": "fac_2", ... } ],
  "page": { "type": "cursor", "next_cursor": "eyJvZmZzZXQiOjEwMH0=", "has_more": true }
}
```

Offset response:

```json
{
  "data": [ { "id": "fac_1", ... }, { "id": "fac_2", ... } ],
  "page": { "type": "offset", "limit": 50, "offset": 100, "has_more": true }
}
```

For cursor responses, when `has_more` is `false`, `next_cursor` is `null`. For offset responses, clients compute the next offset from `offset + data.length` only when `has_more` is `true`.

### 6.3 Batch

```json
{
  "data": {
    "results": [
      { "ok": true,  "data":  { "id": "fac_1", ... } },
      { "ok": false, "error": { "code": "validation_failed", "message": "...", "details": { "field": "price" } } }
    ]
  }
}
```

### 6.4 Error

```json
{
  "error": {
    "code": "facility_not_found",
    "message": "Facility fac_31233213 does not exist.",
    "details": { "id": "fac_31233213" }
  }
}
```

- `code` — stable, snake_case, machine-readable. Clients branch on this.
- `message` — human-readable, may be shown to end users only if the endpoint documents it as safe.
- `details` — optional, structured. Shape is per-`code`.

### 6.5 Standard error codes

| HTTP | `code`                  | When                                              |
| ---- | ----------------------- | ------------------------------------------------- |
| 400  | `bad_request`           | Malformed JSON, missing required keys             |
| 401  | `unauthenticated`       | No / invalid auth token                           |
| 403  | `forbidden`             | Authenticated but not permitted                   |
| 404  | `<resource>_not_found`  | ID-based lookup miss                              |
| 409  | `conflict`              | Optimistic concurrency or unique-constraint clash |
| 422  | `validation_failed`     | Body parsed but semantically invalid              |
| 429  | `rate_limited`          | Throttled; `details.retry_after_ms` provided      |
| 5xx  | `internal_error`        | Server fault                                      |

---

## 7. Mutations: semantics

- **`create_*`** returns the created resource in `data`.
- **`update_*`** is a partial patch. Fields not present in the request are left unchanged. To clear a nullable field, send `null` explicitly. Returns the full updated resource.
- **`replace_*`** is a full overwrite. Missing fields revert to their defaults. Returns the full updated resource.
- **`delete_*`** returns `{ "data": { "id": "..." } }` on success. Idempotent: deleting an already-deleted id returns success, not 404.

### 7.1 Idempotency for `create_*` and `batch_create_*`

Clients may send an `Idempotency-Key` HTTP header (UUID v4 recommended). Within a 24-hour window, repeating a request with the same key returns the original response and does not create a duplicate.

### 7.2 Optimistic concurrency (optional, per endpoint)

For endpoints that support it, include `version` in the body of `update_*` / `replace_*`. Mismatch returns `409 conflict`.

```json
{ "id": "fac_1", "version": 7, "price": 12000 }
```

---

## 8. Auth & tenancy

- Auth is by bearer token in the `Authorization` header.
- **Never** accept `user_id`, `tenant_id`, `org_id`, or any actor identity in the request body. These are derived from the token server-side.
- Endpoints that operate on behalf of another principal (admin tools) take an explicit `on_behalf_of` field and require an elevated scope.

---

## 9. Versioning & deprecation

- URL-versioned: `/api/v1/...`, `/api/v2/...`.
- Breaking changes require a new version. Non-breaking additions (new optional fields, new operators, new endpoints) ship in the current version.
- Deprecation: a deprecated endpoint returns the response header `Deprecation: true` and `Sunset: <RFC 1123 date>`. Minimum 6 months between deprecation and removal.

---

## 10. Cross-cutting headers

| Header               | Direction | Purpose                                          |
| -------------------- | --------- | ------------------------------------------------ |
| `Authorization`      | request   | `Bearer <token>`                                 |
| `Idempotency-Key`    | request   | See §7.1                                         |
| `X-Request-Id`       | both      | Client may set; server echoes or generates       |
| `Deprecation`        | response  | `true` if the endpoint is deprecated             |
| `Sunset`             | response  | Removal date for a deprecated endpoint           |
| `Retry-After`        | response  | On `429` / `503`, seconds to wait                |

---

## 11. Checklist for a new endpoint

Before merging a new endpoint, confirm:

- [ ] Path is `/api/v{N}/{verb}_{resource}` with a verb from §2.
- [ ] `POST` + JSON only. No path or query params.
- [ ] Request body validated against a schema (Zod / JSON Schema).
- [ ] If a list/search endpoint: declares the supported request keys and pagination type(s); returns the §6.2 envelope.
- [ ] If a mutation: documents create / patch / replace / delete semantics per §7.
- [ ] All error responses use codes from §6.5 or add new ones to this doc.
- [ ] Parsing/validation changes have focused tests for the affected status + `error.code` behavior.
- [ ] No actor identity is read from the body.
- [ ] If the endpoint is a read worth caching, it is registered in the cache allowlist per §13.
- [ ] If the endpoint is a mutation, its invalidation tags are declared per §13.4.
- [ ] OpenAPI / typed client artifacts are refreshed from source schemas; generated files are not hand-edited.

---

## 12. Examples

### 12.1 Get a facility

```http
POST /api/v1/get_facility
Content-Type: application/json
Authorization: Bearer ...

{ "id": "fac_31233213" }
```

```json
{ "data": { "id": "fac_31233213", "name": "Sunrise Home", "price": 12000 } }
```

### 12.2 List facilities

```http
POST /api/v1/list_facilities
```

```json
{
  "filters": {
    "price":      { "gte": 100, "lte": 10000 },
    "name":       { "ilike": "sun%" },
    "created_at": { "gte": "2025-01-01T00:00:00Z" }
  },
  "sort":   [ { "field": "created_at", "dir": "desc" } ],
  "page":   { "type": "cursor", "limit": 50 },
  "fields": ["id", "name", "price"]
}
```

```json
{
  "data": [
    { "id": "fac_1", "name": "Sunrise Home", "price": 12000 },
    { "id": "fac_2", "name": "Sunset Villa", "price":  9500 }
  ],
  "page": { "type": "cursor", "next_cursor": "eyJvZmZzZXQiOjUwfQ==", "has_more": true }
}
```

Offset variant:

```json
{
  "filters": {
    "price": { "gte": 100, "lte": 10000 }
  },
  "sort": [ { "field": "created_at", "dir": "desc" } ],
  "page": { "type": "offset", "limit": 50, "offset": 100 }
}
```

```json
{
  "data": [
    { "id": "fac_101", "name": "Golden Residence", "price": 11000 },
    { "id": "fac_102", "name": "Harbor Care", "price": 9800 }
  ],
  "page": { "type": "offset", "limit": 50, "offset": 100, "has_more": true }
}
```

### 12.3 Update a facility

```http
POST /api/v1/update_facility
```

```json
{ "id": "fac_31233213", "price": 12500 }
```

```json
{ "data": { "id": "fac_31233213", "name": "Sunrise Home", "price": 12500 } }
```

### 12.4 Error

```json
{
  "error": {
    "code": "validation_failed",
    "message": "price must be a positive integer",
    "details": { "field": "price", "got": -1 }
  }
}
```

---

## 13. Caching (allowlist)

Reads are **not cached by default**. An endpoint is cached only if it is explicitly registered in the cache allowlist. This keeps invalidation tractable: we never have to wonder whether a given read might be served stale.

### 13.1 What can be cached

A read endpoint is eligible if all of the following are true:

- It is a `get_`, `list_`, or `search_` endpoint.
- Its response is a **pure function** of: the request body + the auth principal's identity/scopes + a known set of underlying resources.
- It does not return time-sensitive data without an explicit TTL bound that's acceptable to consumers.
- Side effects (audit logs, "last viewed at" timestamps, etc.) are either absent or moved to a separate fire-and-forget channel — caching must not skip them silently.

Mutations (`create_`, `update_`, `replace_`, `delete_`, `batch_*`) are **never** cached. They invalidate (see §13.4).

### 13.2 Cache key

The cache key is deterministic and built from:

```
{endpoint_path} | {principal_scope} | {canonical_json(body)}
```

- `principal_scope` is derived from the auth token. Default is the tenant id; endpoints that vary per user must declare `scope: "user"` in their registration.
- `canonical_json(body)` means: sorted keys, no insignificant whitespace, normalized number/string representations. The framework provides the canonicalizer — endpoints must not roll their own.
- Bodies are hashed (e.g. SHA-256) before use as a key fragment so keys stay bounded.

Requests with an empty or missing principal (unauthenticated public endpoints, if any) use `scope: "public"`.

### 13.3 Registration

Each cached endpoint declares its cache policy alongside its handler. Conceptually:

```ts
registerCache({
  endpoint: "/api/v1/search_facilities",
  scope: "tenant",                  // "tenant" | "user" | "public"
  ttl_seconds: 60,
  swr_seconds: 300,                 // optional stale-while-revalidate window
  depends_on: ["facility"],         // resource tags this response reads
  vary_on_fields: true,             // include `fields` projection in the key (default true)
});
```

Rules:

- `ttl_seconds` is required and must be finite. No "cache forever" entries.
- `swr_seconds` is optional; during this window a stale response may be served while a refresh runs in the background.
- `depends_on` is a list of **resource tags** (see §13.4). Lower-cardinality tags = broader invalidation but simpler reasoning. Start broad.
- If an endpoint returns data sliced by `fields`, the projection participates in the key by default. Set `vary_on_fields: false` only if the handler already strips fields after a full fetch.

### 13.4 Invalidation by tags

Every mutation endpoint declares which resource tags it invalidates:

```ts
registerMutation({
  endpoint: "/api/v1/update_facility",
  invalidates: ["facility"],                       // broad
  // or, more surgically:
  invalidates_fn: (req) => [`facility:${req.id}`], // per-id tag
});
```

A cache entry whose `depends_on` includes any tag emitted by a mutation is dropped (or marked stale, for SWR endpoints). Two granularities are supported:

- **Coarse tag** (e.g. `"facility"`): any mutation on that resource type invalidates all cached reads of it. Easy to reason about, fine for low write volume.
- **Fine tag** (e.g. `"facility:fac_31233213"`): only reads that touched that specific id are invalidated. Use when a coarse tag would cause too much churn.

A single endpoint can mix both: depend on `"facility"` for list queries and `"facility:<id>"` for `get_facility`.

### 13.5 Bypass and observability

- A request header `Cache-Control: no-cache` bypasses the cache for that request (still populates on the way back if eligible). Authenticated callers only; rate-limited.
- Responses served from cache include `X-Cache: HIT` (or `STALE` during SWR). `MISS` is set on fresh computations.
- The cache layer emits metrics per endpoint: hit rate, miss rate, stale serves, invalidations, avg key size. New entries to the allowlist are reviewed against these metrics after one week.

### 13.6 What never goes in the cache

- Anything containing user-PII for a different principal than the one keyed.
- Anything whose response depends on "now" beyond the declared TTL (e.g. `expires_in_seconds` countdowns).
- Anything that triggers a side effect on read that we are not willing to skip.

### 13.7 Initial allowlist

Seed entries (update as endpoints land):

| Endpoint                       | scope    | ttl  | swr  | depends_on                     |
| ------------------------------ | -------- | ---- | ---- | ------------------------------ |
| `/api/v1/search_facilities`    | tenant   | 60s  | 300s | `facility`                     |
| `/api/v1/list_facilities`      | tenant   | 30s  | 120s | `facility`                     |
| `/api/v1/get_facility`         | tenant   | 60s  | 300s | `facility:<id>` (fine tag)     |
