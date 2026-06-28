import { assessmentSchemaV1, ASSESSMENT_SCHEMA_V1 } from "./assessmentSchema_v1";
import type { InternalAssessmentSchema } from "./types";
import { ApiError } from "@/shared/errors/apiError";

const schemas = new Map<string, InternalAssessmentSchema>([[ASSESSMENT_SCHEMA_V1, assessmentSchemaV1]]);

export const ACTIVE_ASSESSMENT_SCHEMA_VERSION = ASSESSMENT_SCHEMA_V1;

export function getAssessmentSchemaByVersion(schemaVersion: string): InternalAssessmentSchema {
  const schema = schemas.get(schemaVersion);
  if (!schema) {
    throw new ApiError("validation_failed", `Unsupported assessment schema version ${schemaVersion}.`, 422, {
      schema_version: schemaVersion,
    });
  }
  return schema;
}

export function getActiveAssessmentSchema(): InternalAssessmentSchema {
  return getAssessmentSchemaByVersion(ACTIVE_ASSESSMENT_SCHEMA_VERSION);
}

export function toPresentationSchema(schema: InternalAssessmentSchema) {
  return {
    schema_version: schema.schema_version,
    title: schema.title,
    estimated_minutes: schema.estimated_minutes,
    disclaimer: schema.disclaimer,
    care_types: schema.care_types.map(({ id, name, blurb, next }) => ({ id, name, blurb, next })),
    questions: schema.questions.map((question) => ({
      id: question.id,
      title: question.title,
      sub: question.sub ?? null,
      required: question.required,
      skip_if: question.skip_if,
      options: question.options.map(({ id, label, emoji }) => ({
        id,
        label,
        emoji: emoji ?? null,
      })),
    })),
  };
}
