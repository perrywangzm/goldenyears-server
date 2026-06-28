export const ASSESSMENT_CARE_TYPES = [
  "independent",
  "assisted",
  "nursing",
  "dementia",
  "respite",
  "daycare",
] as const;

export type AssessmentCareType = (typeof ASSESSMENT_CARE_TYPES)[number];
export type AssessmentScores = Record<AssessmentCareType, number>;
export type AssessmentDecidedBy = "override" | "score";

export type AssessmentSkipIf = {
  question_id: string;
  equals: string;
} | null;

export type AssessmentAnswers = Record<string, string>;

export type InternalAssessmentOption = {
  id: string;
  label: string;
  emoji?: string;
  scores?: Partial<AssessmentScores>;
  override?: AssessmentCareType;
};

export type InternalAssessmentQuestion = {
  id: string;
  title: string;
  sub?: string;
  required: boolean;
  skip_if: AssessmentSkipIf;
  options: InternalAssessmentOption[];
};

export type InternalAssessmentSchema = {
  schema_version: string;
  title: string;
  estimated_minutes: number;
  questions: InternalAssessmentQuestion[];
  care_types: Array<{
    id: AssessmentCareType;
    name: string;
    blurb: string;
    next: string;
  }>;
  feature_labels: Record<string, string>;
  disclaimer: {
    kind: "non_diagnostic";
    text: string;
  };
};

export type AssessmentProfile = {
  must_have: string[];
  nice_to_have: string[];
  tags: string[];
};

export type AssessmentScoringOutput = {
  recommended_care_type: AssessmentCareType;
  scores: AssessmentScores;
  decided_by: AssessmentDecidedBy;
  profile: AssessmentProfile;
  because: string[];
};

export type AssessmentMatchInput = {
  id: string;
  features: string[];
  rating_average: number;
  rating_count: number;
};

export type AssessmentMatchOutput = {
  facility_id: string;
  score: number;
  matched_must: string[];
  matched_nice: string[];
  reasons: Array<{ kind: "must" | "nice" | "missing"; label: string }>;
};
