import type { ColumnType, Selectable } from "kysely";
import type { AssessmentAnswers, AssessmentDecidedBy, AssessmentProfile, AssessmentScores } from "@/domain/assessment/types";

export interface AssessmentResultsTable {
  id: string;
  schema_version: string;
  user_id: string | null;
  owner_session_id: string | null;
  recommended_care_type: string;
  scores: AssessmentScores;
  decided_by: AssessmentDecidedBy;
  answers: AssessmentAnswers;
  profile: AssessmentProfile;
  because: string[];
  is_latest: boolean;
  completed_at: ColumnType<Date, Date | string, Date | string>;
  created_at: ColumnType<Date, Date | string, Date | string>;
}

export type AssessmentResultRow = Selectable<AssessmentResultsTable>;
