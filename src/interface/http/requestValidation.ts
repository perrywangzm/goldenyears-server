import type { Context } from "hono";
import { z } from "@hono/zod-openapi";
import type { AppBindings } from "@/config/env";
import { errorEnvelope } from "@/shared/envelopes/envelope";
import { ApiError } from "@/shared/errors/apiError";

type ValidationResult =
  | { success: true; data: unknown; target: string }
  | { success: false; error: z.ZodError; target: string };

export function validationHook(result: ValidationResult, c: Context<AppBindings>) {
  if (result.success) {
    return undefined;
  }

  return c.json(
    errorEnvelope({
      code: "validation_failed",
      message: "Request validation failed.",
      details: validationDetails(result.error, c.get("requestId")),
    }),
    422,
  );
}

export async function readJson<T extends z.ZodTypeAny>(
  c: Context<AppBindings>,
  schema: T,
): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError("bad_request", "Malformed JSON body.", 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError("validation_failed", "Request validation failed.", 422, {
      issues: sanitizedIssues(parsed.error),
    });
  }
  return parsed.data;
}

function validationDetails(error: z.ZodError, requestId: string | undefined) {
  return {
    issues: sanitizedIssues(error),
    request_id: requestId,
  };
}

function sanitizedIssues(error: z.ZodError) {
  return error.issues.map((issue) => ({
    code: issue.code,
    path: issue.path,
    message: issue.message,
  }));
}
