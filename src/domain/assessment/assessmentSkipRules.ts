import type { AssessmentAnswers, AssessmentSkipIf, InternalAssessmentQuestion } from "./types";

export function isQuestionSkipped(skipIf: AssessmentSkipIf, answers: AssessmentAnswers): boolean {
  if (!skipIf) return false;
  return answers[skipIf.question_id] === skipIf.equals;
}

export function visibleAssessmentQuestions(
  questions: InternalAssessmentQuestion[],
  answers: AssessmentAnswers,
): InternalAssessmentQuestion[] {
  return questions.filter((question) => !isQuestionSkipped(question.skip_if, answers));
}
