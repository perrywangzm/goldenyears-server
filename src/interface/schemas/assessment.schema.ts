import { z } from "@hono/zod-openapi";
import { FacilityCardSchema } from "@/interface/schemas/marketplace.schema";
import { FilterDslSchema } from "@/shared/filters/filterDsl.schema";
import { SortSchema } from "@/shared/pagination/page.schema";

export const AssessmentSkipIfSchema = z
  .object({
    question_id: z.string(),
    equals: z.string(),
  })
  .strict()
  .nullable()
  .openapi("AssessmentSkipIf");

export const AssessmentSchemaOptionSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    emoji: z.string().nullable(),
  })
  .strict()
  .openapi("AssessmentSchemaOption");

export const AssessmentSchemaQuestionSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    sub: z.string().nullable(),
    required: z.boolean(),
    skip_if: AssessmentSkipIfSchema,
    options: z.array(AssessmentSchemaOptionSchema),
  })
  .strict()
  .openapi("AssessmentSchemaQuestion");

export const AssessmentCareTypeInfoSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    blurb: z.string(),
    next: z.string(),
  })
  .strict()
  .openapi("AssessmentCareTypeInfo");

export const AssessmentSchemaSchema = z
  .object({
    schema_version: z.string(),
    title: z.string(),
    estimated_minutes: z.number().int(),
    disclaimer: z.object({
      kind: z.literal("non_diagnostic"),
      text: z.string(),
    }),
    care_types: z.array(AssessmentCareTypeInfoSchema),
    questions: z.array(AssessmentSchemaQuestionSchema),
  })
  .strict()
  .openapi("AssessmentSchema");

export const GetAssessmentSchemaRequestSchema = z
  .object({
    locale: z.string().optional(),
  })
  .strict()
  .openapi("GetAssessmentSchemaRequest");

export const CreateAssessmentResultRequestSchema = z
  .object({
    schema_version: z.string(),
    answers: z.record(z.string(), z.string()),
  })
  .strict()
  .openapi("CreateAssessmentResultRequest");

export const AssessmentProfileSchema = z
  .object({
    must_have: z.array(z.string()),
    nice_to_have: z.array(z.string()),
    tags: z.array(z.string()),
  })
  .strict()
  .openapi("AssessmentProfile");

export const AssessmentMatchReasonSchema = z
  .object({
    kind: z.enum(["must", "nice", "missing"]),
    label: z.string(),
  })
  .strict()
  .openapi("AssessmentMatchReason");

export const AssessmentMatchSchema = z
  .object({
    facility: FacilityCardSchema,
    score: z.number(),
    reasons: z.array(AssessmentMatchReasonSchema),
  })
  .strict()
  .openapi("AssessmentMatch");

export const AssessmentViewAllSearchSchema = z
  .object({
    filters: FilterDslSchema.optional(),
    sort: z.array(SortSchema).optional(),
    page: z
      .object({
        type: z.literal("offset"),
        limit: z.number().int(),
        offset: z.number().int(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .openapi("AssessmentViewAllSearch");

export const AssessmentResultSchema = z
  .object({
    id: z.string(),
    schema_version: z.string(),
    answers: z.record(z.string(), z.string()),
    recommended_care_type: z.string(),
    scores: z.record(z.string(), z.number()),
    decided_by: z.enum(["override", "score"]),
    profile: AssessmentProfileSchema,
    because: z.array(z.string()),
    care_type: AssessmentCareTypeInfoSchema,
    completed_at: z.string(),
    matches: z.array(AssessmentMatchSchema),
    view_all_search: AssessmentViewAllSearchSchema,
  })
  .strict()
  .openapi("AssessmentResult");

export const GetLatestAssessmentResultRequestSchema = z
  .object({})
  .strict()
  .openapi("GetLatestAssessmentResultRequest");

export const ListAssessmentMatchesRequestSchema = z
  .object({
    id: z.string(),
  })
  .strict()
  .openapi("ListAssessmentMatchesRequest");

export const DeleteLatestAssessmentResultRequestSchema = z
  .object({})
  .strict()
  .openapi("DeleteLatestAssessmentResultRequest");

export const DeleteLatestAssessmentResultDataSchema = z
  .object({ id: z.string() })
  .strict()
  .openapi("DeleteLatestAssessmentResultData");

export const AssessmentDashboardSummarySchema = z
  .object({
    id: z.string(),
    recommended_care_type: z.string(),
    care_type_name: z.string(),
    completed_at: z.string(),
  })
  .strict()
  .nullable()
  .openapi("AssessmentDashboardSummary");

export const ListAssessmentMatchesResponseSchema = z
  .object({
    matches: z.array(AssessmentMatchSchema),
    view_all_search: AssessmentViewAllSearchSchema,
  })
  .strict()
  .openapi("ListAssessmentMatchesResponse");
