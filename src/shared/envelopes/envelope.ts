import { z } from "@hono/zod-openapi";

export const ErrorEnvelopeSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: "validation_failed" }),
      message: z.string().openapi({ example: "Request validation failed." }),
      details: z.record(z.string(), z.unknown()).optional(),
    }),
  })
  .openapi("ErrorEnvelope");

export const EmptyJsonBodySchema = z.object({}).openapi("EmptyJsonBody");

export function dataEnvelope<T>(data: T) {
  return { data };
}

export function listEnvelope<T>(data: T, page?: unknown) {
  return page === undefined ? { data } : { data, page };
}

export function errorEnvelope(error: {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}) {
  return { error };
}

export function dataEnvelopeSchema<T extends z.ZodTypeAny>(schema: T, name: string) {
  return z.object({ data: schema }).openapi(name);
}

export function listEnvelopeSchema<T extends z.ZodTypeAny, P extends z.ZodTypeAny>(
  itemSchema: T,
  pageSchema: P,
  name: string,
) {
  return z.object({ data: z.array(itemSchema), page: pageSchema }).openapi(name);
}
