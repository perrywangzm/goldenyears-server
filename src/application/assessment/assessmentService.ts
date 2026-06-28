import type { Repositories } from "@/db/repositories/ports";
import { toFacilityCardProjection } from "@/db/projections/facilityPublicProjection";
import {
  getActiveAssessmentSchema,
  getAssessmentSchemaByVersion,
  toPresentationSchema,
} from "@/domain/assessment/assessmentRegistry";
import { buildViewAllSearch, rankAssessmentMatches } from "@/domain/assessment/assessmentMatching";
import { scoreAssessmentAnswers } from "@/domain/assessment/assessmentScoring";
import { validateAssessmentAnswers } from "@/domain/assessment/assessmentValidation";
import { ApiError } from "@/shared/errors/apiError";
import type { RequestContext } from "@/shared/request-context/context";

export type CreateAssessmentResultInput = {
  schema_version: string;
  answers: Record<string, string>;
};

export class AssessmentService {
  constructor(private readonly repos: Repositories) {}

  getSchema() {
    return toPresentationSchema(getActiveAssessmentSchema());
  }

  async create(ctx: RequestContext, input: CreateAssessmentResultInput, ownerSessionId: string) {
    const schema = getAssessmentSchemaByVersion(input.schema_version);
    validateAssessmentAnswers(schema, input.answers);
    const scored = scoreAssessmentAnswers(schema, input.answers);
    const now = ctx.now ?? new Date();
    const userId = ctx.actor.userId;
    const row = await this.repos.assessments.create({
      id: `asmt_${crypto.randomUUID()}`,
      schema_version: schema.schema_version,
      user_id: userId,
      owner_session_id: userId ? ctx.actor.sessionId : ownerSessionId,
      recommended_care_type: scored.recommended_care_type,
      scores: scored.scores,
      decided_by: scored.decided_by,
      answers: input.answers,
      profile: scored.profile,
      because: scored.because,
      is_latest: true,
      completed_at: now,
    });

    return this.toResultDto(row, ctx);
  }

  async getLatest(ctx: RequestContext, ownerSessionId: string | null) {
    const row = await this.repos.assessments.findLatestForOwner({
      user_id: ctx.actor.userId,
      owner_session_id: ctx.actor.userId ? ctx.actor.sessionId : ownerSessionId,
    });
    if (!row) return null;
    this.assertCanRead(ctx, row.user_id, row.owner_session_id, ownerSessionId);
    return this.toResultDto(row, ctx);
  }

  async listMatches(ctx: RequestContext, assessmentId: string, ownerSessionId: string | null) {
    const row = await this.repos.assessments.findById(assessmentId);
    if (!row) {
      throw new ApiError("not_found", "Assessment result was not found.", 404, { id: assessmentId });
    }
    this.assertCanRead(ctx, row.user_id, row.owner_session_id, ownerSessionId);
    const schema = getAssessmentSchemaByVersion(row.schema_version);
    const matches = await this.buildMatches(ctx, row.recommended_care_type, row.profile, schema.feature_labels);
    return {
      matches,
      view_all_search: buildViewAllSearch(row.recommended_care_type, row.profile),
    };
  }

  async deleteLatest(ctx: RequestContext, ownerSessionId: string | null) {
    const scope = this.ownerScope(ctx, ownerSessionId);
    const deleted = await this.repos.assessments.deleteLatestForOwner(scope);
    return deleted ?? { id: "" };
  }

  async claimAnonymousSession(userId: string, sessionId: string | null, anonymousSessionId: string) {
    return this.repos.assessments.claimAnonymousSession(anonymousSessionId, userId, sessionId);
  }

  async getLatestSummaryForUser(userId: string) {
    const row = await this.repos.assessments.findLatestForOwner({ user_id: userId, owner_session_id: null });
    if (!row) return null;
    const schema = getAssessmentSchemaByVersion(row.schema_version);
    const careType = schema.care_types.find((entry) => entry.id === row.recommended_care_type);
    return {
      id: row.id,
      recommended_care_type: row.recommended_care_type,
      care_type_name: careType?.name ?? row.recommended_care_type,
      completed_at: new Date(row.completed_at).toISOString(),
    };
  }

  private ownerScope(ctx: RequestContext, ownerSessionId: string | null) {
    return {
      user_id: ctx.actor.userId,
      owner_session_id: ctx.actor.userId ? ctx.actor.sessionId : ownerSessionId,
    };
  }

  private async toResultDto(
    row: Awaited<ReturnType<Repositories["assessments"]["create"]>>,
    ctx: RequestContext,
  ) {
    const schema = getAssessmentSchemaByVersion(row.schema_version);
    const careType = schema.care_types.find((entry) => entry.id === row.recommended_care_type);
    if (!careType) {
      throw new ApiError("internal_error", "Assessment care type metadata is missing.", 500, {
        recommended_care_type: row.recommended_care_type,
      });
    }

    const matches = await this.buildMatches(ctx, row.recommended_care_type, row.profile, schema.feature_labels);
    return {
      id: row.id,
      schema_version: row.schema_version,
      answers: row.answers,
      recommended_care_type: row.recommended_care_type,
      scores: row.scores,
      decided_by: row.decided_by,
      profile: row.profile,
      because: row.because,
      care_type: careType,
      completed_at: new Date(row.completed_at).toISOString(),
      matches,
      view_all_search: buildViewAllSearch(row.recommended_care_type, row.profile),
    };
  }

  private async buildMatches(
    ctx: RequestContext,
    recommendedCareType: string,
    profile: { must_have: string[]; nice_to_have: string[]; tags: string[] },
    featureLabels: Record<string, string>,
  ) {
    const facilities = await this.repos.facilities.listPublic({
      filters: { care_type: { eq: recommendedCareType } },
      sort: [{ field: "rating", dir: "desc" }],
      limit: 20,
      offset: 0,
    });
    const savedIds = await this.repos.savedFacilities.savedFacilityIdsForUser(ctx.actor.userId);
    const publishedReviews = await this.repos.reviews.allPublished();
    const ranked = rankAssessmentMatches(
      facilities.rows.map((facility) => ({
        id: facility.id,
        features: facility.features,
        rating_average: facility.rating,
        rating_count: facility.review_count,
      })),
      profile,
      featureLabels,
    );
    const facilityById = new Map(facilities.rows.map((facility) => [facility.id, facility]));
    return ranked
      .map((match) => {
        const facility = facilityById.get(match.facility_id);
        if (!facility) return null;
        return {
          facility: toFacilityCardProjection(facility, publishedReviews, savedIds),
          score: match.score,
          reasons: match.reasons,
        };
      })
      .filter((match): match is NonNullable<typeof match> => match !== null);
  }

  private assertCanRead(
    ctx: RequestContext,
    userId: string | null,
    ownerSessionId: string | null,
    anonymousSessionId: string | null,
  ) {
    if (userId && ctx.actor.userId === userId) return;
    if (!userId && ownerSessionId && anonymousSessionId === ownerSessionId) return;
    throw new ApiError("forbidden", "You do not have access to this assessment result.", 403);
  }
}

export const ASSESSMENT_SESSION_COOKIE = "gy_assessment_session";

export function readAssessmentSessionCookie(header: string | undefined): string | null {
  const value = header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ASSESSMENT_SESSION_COOKIE}=`))
    ?.slice(ASSESSMENT_SESSION_COOKIE.length + 1);
  return value && value.length > 0 ? value : null;
}

export function resolveAssessmentOwnerSessionId(existingCookie: string | undefined): string {
  return existingCookie && existingCookie.length > 0 ? existingCookie : crypto.randomUUID();
}
