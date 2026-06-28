import { visibleAssessmentQuestions } from "./assessmentSkipRules";
import type { AssessmentAnswers, InternalAssessmentSchema } from "./types";
import { ApiError } from "@/shared/errors/apiError";

export function validateAssessmentAnswers(schema: InternalAssessmentSchema, answers: AssessmentAnswers) {
  const visible = visibleAssessmentQuestions(schema.questions, answers);
  const questionIds = new Set(schema.questions.map((question) => question.id));

  for (const [questionId, answerId] of Object.entries(answers)) {
    if (!questionIds.has(questionId)) {
      throw new ApiError("validation_failed", `Unknown assessment question ${questionId}.`, 422, {
        question_id: questionId,
      });
    }

    const question = schema.questions.find((entry) => entry.id === questionId);
    const option = question?.options.find((entry) => entry.id === answerId);
    if (!option) {
      throw new ApiError("validation_failed", `Unknown assessment option ${answerId}.`, 422, {
        question_id: questionId,
        option_id: answerId,
      });
    }
  }

  for (const question of visible) {
    if (!question.required) continue;
    if (!answers[question.id]) {
      throw new ApiError("validation_failed", `Missing required answer for ${question.id}.`, 422, {
        question_id: question.id,
      });
    }
  }

  for (const question of schema.questions) {
    if (isQuestionSkipped(question, answers) && answers[question.id]) {
      throw new ApiError("validation_failed", `Answer provided for skipped question ${question.id}.`, 422, {
        question_id: question.id,
      });
    }
  }
}

function isQuestionSkipped(
  question: InternalAssessmentSchema["questions"][number],
  answers: AssessmentAnswers,
) {
  if (!question.skip_if) return false;
  return answers[question.skip_if.question_id] === question.skip_if.equals;
}
