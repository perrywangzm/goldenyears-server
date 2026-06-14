export const standardErrorCodes = [
  "bad_request",
  "unauthenticated",
  "forbidden",
  "facility_not_found",
  "article_not_found",
  "session_not_found",
  "not_found",
  "conflict",
  "validation_failed",
  "rate_limited",
  "internal_error",
] as const;

export type StandardErrorCode = (typeof standardErrorCodes)[number];

export const errorStatusByCode: Record<StandardErrorCode, number> = {
  bad_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  facility_not_found: 404,
  article_not_found: 404,
  session_not_found: 404,
  not_found: 404,
  conflict: 409,
  validation_failed: 422,
  rate_limited: 429,
  internal_error: 500,
};
