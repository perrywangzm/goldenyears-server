import { describe, expect, it } from "vitest";
import { getActiveAssessmentSchema } from "./assessmentRegistry";
import { visibleAssessmentQuestions } from "./assessmentSkipRules";
import { validateAssessmentAnswers } from "./assessmentValidation";
import { scoreAssessmentAnswers } from "./assessmentScoring";
import { rankAssessmentMatches } from "./assessmentMatching";
import { inferAssessmentProfile } from "./assessmentProfile";
import { buildAssessmentBecauseLines } from "./assessmentExplanation";

describe("Feature: Assessment scoring", () => {
  const schema = getActiveAssessmentSchema();

  it("Scenario: Moderate dementia override wins", () => {
    const answers = {
      for_whom: "parent",
      daily_help: "daily",
      cognitive: "moderate",
      medical: "stable",
      urgency: "few_months",
      current_situation: "with_family",
      caregiver: "fine",
    };

    const result = scoreAssessmentAnswers(schema, answers);
    expect(result.recommended_care_type).toBe("dementia");
    expect(result.decided_by).toBe("override");
  });

  it("Scenario: Skilled nursing override wins", () => {
    const answers = {
      for_whom: "parent",
      daily_help: "247",
      cognitive: "none",
      medical: "skilled",
      urgency: "urgent",
      current_situation: "hospital",
      caregiver: "stretched",
    };

    const result = scoreAssessmentAnswers(schema, answers);
    expect(result.recommended_care_type).toBe("nursing");
    expect(result.decided_by).toBe("override");
  });

  it("Scenario: Caregiver question is skipped for self assessments", () => {
    const answers = { for_whom: "self" };
    const visible = visibleAssessmentQuestions(schema.questions, answers);
    expect(visible.map((question) => question.id)).not.toContain("caregiver");
  });

  it("Scenario: Missing required visible answers are rejected", () => {
    expect(() =>
      validateAssessmentAnswers(schema, {
        for_whom: "parent",
        daily_help: "daily",
      }),
    ).toThrow(/Missing required answer/);
  });

  it("Scenario: Facility ranking applies must-have penalties", () => {
    const profile = {
      must_have: ["dementia_trained", "med247"],
      nice_to_have: ["activities"],
      tags: ["dementia care"],
    };
    const matches = rankAssessmentMatches(
      [
        { id: "fac_a", features: ["dementia_trained", "med247", "activities"], rating_average: 4.5, rating_count: 10 },
        { id: "fac_b", features: ["dementia_trained"], rating_average: 4.9, rating_count: 50 },
      ],
      profile,
      schema.feature_labels,
    );

    expect(matches[0]?.facility_id).toBe("fac_a");
    expect(matches[0]?.reasons.some((reason) => reason.kind === "missing")).toBe(false);
    expect(matches[1]?.reasons.some((reason) => reason.kind === "missing")).toBe(true);
  });

  it("Scenario: Score summation picks the highest care type", () => {
    const answers = {
      for_whom: "self",
      daily_help: "none",
      cognitive: "none",
      medical: "healthy",
      urgency: "exploring",
      current_situation: "alone_fine",
    };

    const result = scoreAssessmentAnswers(schema, answers);
    expect(result.recommended_care_type).toBe("independent");
    expect(result.decided_by).toBe("score");
  });

  it("Scenario: Score-based recommendation picks assisted living for moderate support needs", () => {
    const answers = {
      for_whom: "parent",
      daily_help: "light",
      cognitive: "none",
      medical: "stable",
      urgency: "exploring",
      current_situation: "in_facility",
      caregiver: "fine",
    };

    const result = scoreAssessmentAnswers(schema, answers);
    expect(result.recommended_care_type).toBe("assisted");
    expect(result.decided_by).toBe("score");
    expect(result.scores.assisted).toBeGreaterThan(result.scores.daycare);
  });

  it("Scenario: Profile inference adds must-have features for skilled nursing", () => {
    const profile = inferAssessmentProfile(
      {
        medical: "skilled",
        cognitive: "none",
        daily_help: "247",
        caregiver: "stretched",
        current_situation: "hospital",
      },
      "nursing",
    );

    expect(profile.must_have).toEqual(expect.arrayContaining(["med247", "physio"]));
    expect(profile.tags).toEqual(expect.arrayContaining(["24/7 medical coverage", "rehab / physio support"]));
  });

  it("Scenario: Explanation lines summarize caregiver and medical answers", () => {
    const lines = buildAssessmentBecauseLines({
      daily_help: "247",
      medical: "skilled",
      caregiver: "stretched",
    });

    expect(lines).toEqual(
      expect.arrayContaining([
        "Round-the-clock help is needed.",
        "Skilled nursing care is required (wounds, IV, etc.).",
        "The primary caregiver is feeling stretched thin.",
      ]),
    );
  });
});
