import { errorStatusByCode, type StandardErrorCode } from "./errorCodes";

export type ApiErrorCode = StandardErrorCode;

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ApiErrorCode, message: string, status = 400, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (code === "unauthenticated") {
      return new ApiError("unauthenticated", "Authentication is required.", 401);
    }
  }

  return new ApiError("internal_error", "An unexpected error occurred.", 500);
}

export function apiErrorFromCode(
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError(code, message, errorStatusByCode[code], details);
}
