import type { AssessmentMatchInput, AssessmentMatchOutput, AssessmentProfile, InternalAssessmentSchema } from "./types";

export function scoreAssessmentFacility(
  facility: AssessmentMatchInput,
  profile: AssessmentProfile,
  featureLabels: InternalAssessmentSchema["feature_labels"],
): AssessmentMatchOutput {
  const facilityFeatures = new Set(facility.features ?? []);
  const matchedMust = profile.must_have.filter((id) => facilityFeatures.has(id));
  const matchedNice = profile.nice_to_have.filter((id) => facilityFeatures.has(id));
  const missingMust = profile.must_have.length - matchedMust.length;
  const score =
    matchedMust.length * 10 -
    missingMust * 4 +
    matchedNice.length * 3 +
    facility.rating_average +
    Math.log10(facility.rating_count + 1) * 0.6;

  return {
    facility_id: facility.id,
    score,
    matched_must: matchedMust,
    matched_nice: matchedNice,
    reasons: buildMatchReasons(matchedMust, matchedNice, profile, featureLabels),
  };
}

export function rankAssessmentMatches(
  facilities: AssessmentMatchInput[],
  profile: AssessmentProfile,
  featureLabels: InternalAssessmentSchema["feature_labels"],
  limit = 5,
): AssessmentMatchOutput[] {
  return facilities
    .map((facility) => scoreAssessmentFacility(facility, profile, featureLabels))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function buildMatchReasons(
  matchedMust: string[],
  matchedNice: string[],
  profile: AssessmentProfile,
  featureLabels: Record<string, string>,
): AssessmentMatchOutput["reasons"] {
  const reasons: AssessmentMatchOutput["reasons"] = matchedMust.map((id) => ({
    kind: "must",
    label: featureLabels[id] ?? id,
  }));
  const missing = profile.must_have.filter((id) => !matchedMust.includes(id));
  reasons.push(
    ...missing.map((id) => ({
      kind: "missing" as const,
      label: featureLabels[id] ?? id,
    })),
  );
  reasons.push(
    ...matchedNice.slice(0, 2).map((id) => ({
      kind: "nice" as const,
      label: featureLabels[id] ?? id,
    })),
  );
  return reasons;
}

export function buildViewAllSearch(recommendedCareType: string, profile: AssessmentProfile) {
  const filters: Record<string, unknown> = {
    care_type: { eq: recommendedCareType },
  };
  if (profile.must_have.length) {
    filters.feature = { in: profile.must_have };
  }
  return {
    filters,
    sort: [{ field: "rating", dir: "desc" as const }],
    page: { type: "offset" as const, limit: 20, offset: 0 },
  };
}
