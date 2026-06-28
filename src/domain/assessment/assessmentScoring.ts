import type {
  AssessmentAnswers,
  AssessmentCareType,
  AssessmentScores,
  AssessmentScoringOutput,
  InternalAssessmentSchema,
} from "./types";
import { inferAssessmentProfile } from "./assessmentProfile";
import { buildAssessmentBecauseLines } from "./assessmentExplanation";

const CARE_TYPE_ORDER: AssessmentCareType[] = [
  "independent",
  "assisted",
  "nursing",
  "dementia",
  "respite",
  "daycare",
];

export function scoreAssessmentAnswers(
  schema: InternalAssessmentSchema,
  answers: AssessmentAnswers,
): AssessmentScoringOutput {
  for (const question of schema.questions) {
    const answer = answers[question.id];
    const option = question.options.find((entry) => entry.id === answer);
    if (option?.override) {
      const recommendedCareType = option.override;
      return {
        recommended_care_type: recommendedCareType,
        scores: scoreFromAnswers(schema, answers),
        decided_by: "override",
        profile: inferAssessmentProfile(answers, recommendedCareType),
        because: buildAssessmentBecauseLines(answers),
      };
    }
  }

  const scores = scoreFromAnswers(schema, answers);
  const recommendedCareType = pickTopCareType(scores);
  return {
    recommended_care_type: recommendedCareType,
    scores,
    decided_by: "score",
    profile: inferAssessmentProfile(answers, recommendedCareType),
    because: buildAssessmentBecauseLines(answers),
  };
}

function scoreFromAnswers(schema: InternalAssessmentSchema, answers: AssessmentAnswers): AssessmentScores {
  const scores = emptyScores();
  for (const question of schema.questions) {
    const answer = answers[question.id];
    const option = question.options.find((entry) => entry.id === answer);
    if (!option?.scores) continue;
    for (const careType of CARE_TYPE_ORDER) {
      scores[careType] += option.scores[careType] ?? 0;
    }
  }
  return scores;
}

function pickTopCareType(scores: AssessmentScores): AssessmentCareType {
  let top: AssessmentCareType = "assisted";
  let topScore = -1;
  for (const careType of CARE_TYPE_ORDER) {
    const value = scores[careType];
    if (value > topScore) {
      top = careType;
      topScore = value;
    }
  }
  return top;
}

function emptyScores(): AssessmentScores {
  return {
    independent: 0,
    assisted: 0,
    nursing: 0,
    dementia: 0,
    respite: 0,
    daycare: 0,
  };
}
