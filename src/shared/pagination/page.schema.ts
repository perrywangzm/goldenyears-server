import { z } from "@hono/zod-openapi";

export const SortSchema = z
  .object({
    field: z.string(),
    dir: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict()
  .openapi("Sort");

export const OffsetPageRequestSchema = z
  .object({
    type: z.literal("offset"),
    limit: z.number().int().min(1).max(200).default(20),
    offset: z.number().int().min(0).default(0),
  })
  .strict()
  .openapi("OffsetPageRequest");

export const CursorPageRequestSchema = z
  .object({
    type: z.literal("cursor"),
    limit: z.number().int().min(1).max(200).default(20),
    cursor: z.string().optional(),
  })
  .strict()
  .openapi("CursorPageRequest");

export const PageRequestSchema = z
  .discriminatedUnion("type", [OffsetPageRequestSchema, CursorPageRequestSchema])
  .optional();

export const OffsetPageResponseSchema = z
  .object({
    type: z.literal("offset"),
    limit: z.number().int(),
    offset: z.number().int(),
    has_more: z.boolean(),
    total_count: z.number().int().optional(),
  })
  .openapi("OffsetPageResponse");

export const CursorPageResponseSchema = z
  .object({
    type: z.literal("cursor"),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  })
  .openapi("CursorPageResponse");

export type PageRequest = z.infer<typeof PageRequestSchema>;

export function resolveOffsetPage(page: PageRequest) {
  if (!page || page.type !== "offset") {
    return { type: "offset" as const, limit: 20, offset: 0 };
  }

  return { type: "offset" as const, limit: page.limit, offset: page.offset };
}
