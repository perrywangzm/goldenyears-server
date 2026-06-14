import { ApiError, apiErrorFromCode, type ApiErrorCode } from "./apiError";

export class DomainError extends ApiError {
  constructor(code: ApiErrorCode, message: string, status = 422, details?: Record<string, unknown>) {
    super(code, message, status, details);
    this.name = "DomainError";
  }
}

export class ApplicationError extends ApiError {
  constructor(code: ApiErrorCode, message: string, status = 400, details?: Record<string, unknown>) {
    super(code, message, status, details);
    this.name = "ApplicationError";
  }
}

export function mapDomainError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: ApiErrorCode }).code;
    const message = error instanceof Error ? error.message : "Request failed.";
    if (code) {
      return apiErrorFromCode(code, message);
    }
  }
  return apiErrorFromCode("internal_error", "An unexpected error occurred.");
}
