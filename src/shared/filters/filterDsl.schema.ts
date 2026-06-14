import { z } from "@hono/zod-openapi";

export const filterOperatorNames = [
  "eq",
  "neq",
  "in",
  "nin",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "is_null",
] as const;

const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const FieldPredicateSchema = z.partialRecord(
  z.enum(filterOperatorNames),
  z.union([scalar, z.array(scalar)]),
);

export type FilterNode = {
  and?: FilterNode[];
  or?: FilterNode[];
  not?: FilterNode;
  [field: string]: unknown;
};

export const FilterDslSchema: z.ZodType<FilterNode> = z.lazy(() =>
  z
    .object({
      and: z.array(FilterDslSchema).optional(),
      or: z.array(FilterDslSchema).optional(),
      not: FilterDslSchema.optional(),
    })
    .catchall(FieldPredicateSchema)
    .openapi("FilterDsl"),
);

export const ListRequestSchema = z
  .object({
    filters: FilterDslSchema.optional(),
    sort: z.array(z.object({ field: z.string(), dir: z.enum(["asc", "desc"]) }).strict()).optional(),
    page: z.unknown().optional(),
    fields: z.array(z.string()).optional(),
  })
  .strict()
  .openapi("ListRequest");
