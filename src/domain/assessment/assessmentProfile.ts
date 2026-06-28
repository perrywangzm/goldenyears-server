import type { AssessmentAnswers, AssessmentCareType, AssessmentProfile } from "./types";

export function inferAssessmentProfile(answers: AssessmentAnswers, careTypeId: AssessmentCareType): AssessmentProfile {
  const mustHave = new Set<string>();
  const niceToHave = new Set<string>();
  const tags: string[] = [];

  if (answers.cognitive === "moderate" || answers.cognitive === "early") {
    mustHave.add("dementia_trained");
    tags.push("dementia care");
  } else if (answers.cognitive === "mild") {
    niceToHave.add("dementia_trained");
  }

  if (answers.medical === "skilled" || answers.medical === "complex") {
    mustHave.add("med247");
    tags.push("24/7 medical coverage");
  }
  if (answers.medical === "recovery" || answers.current_situation === "hospital") {
    mustHave.add("physio");
    tags.push("rehab / physio support");
  }
  if (answers.daily_help === "247" || answers.daily_help === "daily") niceToHave.add("wheelchair");
  if (answers.caregiver === "burnt_out" || answers.caregiver === "stretched") {
    niceToHave.add("family_lounge");
    niceToHave.add("activities");
    tags.push("strong activities programme");
  }
  if (answers.current_situation === "alone_fine") {
    niceToHave.add("activities");
    niceToHave.add("outings");
  }
  if (careTypeId === "respite") tags.push("short-term stays");

  return {
    must_have: [...mustHave],
    nice_to_have: [...niceToHave],
    tags,
  };
}
