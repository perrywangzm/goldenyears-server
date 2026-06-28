import type { AssessmentAnswers } from "./types";

export function buildAssessmentBecauseLines(answers: AssessmentAnswers): string[] {
  const lines: string[] = [];
  const helpMap: Record<string, string> = {
    none: "Your loved one manages independently right now",
    light: "Light occasional help with daily activities is needed",
    daily: "Daily help with several activities is needed",
    "247": "Round-the-clock help is needed",
  };
  if (answers.daily_help && helpMap[answers.daily_help]) lines.push(`${helpMap[answers.daily_help]}.`);

  const cognitiveMap: Record<string, string> = {
    early: "There's an early-stage dementia diagnosis",
    moderate: "There's a diagnosed dementia at moderate or advanced stage",
    mild: "There are mild memory concerns",
  };
  if (answers.cognitive && cognitiveMap[answers.cognitive]) lines.push(`${cognitiveMap[answers.cognitive]}.`);

  const medicalMap: Record<string, string> = {
    skilled: "Skilled nursing care is required (wounds, IV, etc.)",
    recovery: "Recent hospitalisation means short-term recovery support is the priority",
    complex: "There are multiple conditions and complex medications to manage",
  };
  if (answers.medical && medicalMap[answers.medical]) lines.push(`${medicalMap[answers.medical]}.`);
  if (answers.urgency === "short_term") lines.push("This is a short-term need, not a permanent placement.");
  if (answers.caregiver === "burnt_out") lines.push("The primary caregiver is burnt out and needs a break.");
  else if (answers.caregiver === "stretched") lines.push("The primary caregiver is feeling stretched thin.");

  return lines;
}
