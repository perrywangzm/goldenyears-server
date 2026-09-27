import type { InMemoryStore } from "./inMemoryStore";
import { ApiError } from "@/shared/errors/apiError";
import type {
	PartnerCreateReviewFlagInput,
	PartnerCreateReviewResponseInput,
	PartnerFindFacilityReviewInput,
	PartnerListFacilityReviewsInput,
	PartnerUpdateReviewResponseInput,
} from "./ports";

export class ReviewRepository {
  constructor(private readonly store: InMemoryStore) {}

  listPublishedForFacility(facilityId: string, limit: number, offset: number) {
    const rows = this.store.reviews
      .filter((review) => review.facility_id === facilityId && review.status === "published")
      .toSorted((a, b) => b.review_date.localeCompare(a.review_date));
    return {
      rows: rows.slice(offset, offset + limit),
      total: rows.length,
      hasMore: offset + limit < rows.length,
    };
  }

  allPublished() {
    return this.store.reviews.filter((review) => review.status === "published");
  }

  listForFacilityForPartner(input: PartnerListFacilityReviewsInput) {
    const matching = this.store.reviews
      .filter(
        (review) =>
          review.facility_id === input.facilityId &&
          (!input.statuses || input.statuses.includes(review.status)),
      )
      .toSorted(
        (left, right) =>
          right.review_date.localeCompare(left.review_date) ||
          new Date(right.created_at).getTime() - new Date(left.created_at).getTime() ||
          left.id.localeCompare(right.id),
      );
    const rows = matching.slice(input.offset, input.offset + input.limit);
    return {
      rows,
      total: matching.length,
      hasMore: input.offset + rows.length < matching.length,
    };
  }

  findForFacility(input: PartnerFindFacilityReviewInput) {
    return this.store.reviews.find(
      (review) => review.id === input.reviewId && review.facility_id === input.facilityId,
    );
  }

  findResponseForReview(reviewId: string) {
    return this.store.reviewResponses.find((response) => response.review_id === reviewId);
  }

  listResponsesForReviews(reviewIds: string[]) {
    const ids = new Set(reviewIds);
    return this.store.reviewResponses.filter((response) => ids.has(response.review_id));
  }

  createResponse(input: PartnerCreateReviewResponseInput) {
    this.assertReviewExists(input);
    if (this.findResponseForReview(input.reviewId)) {
      throw new ApiError("conflict", "Review response already exists.", 409, {
        reviewId: input.reviewId,
      });
    }

    const response = {
      id: `rresp_${crypto.randomUUID().replaceAll("-", "")}`,
      review_id: input.reviewId,
      facility_id: input.facilityId,
      responder_user_id: input.responderUserId,
      body: input.body,
      status: "published" as const,
      version: 1,
      created_at: input.now,
      updated_at: input.now,
    };
    this.store.reviewResponses.push(response);
    return response;
  }

  updateResponse(input: PartnerUpdateReviewResponseInput) {
    this.assertReviewExists(input);
    const response = this.store.reviewResponses.find(
      (row) => row.review_id === input.reviewId && row.facility_id === input.facilityId,
    );
    if (!response) {
      throw new ApiError("not_found", "Review response was not found.", 404, {
        reviewId: input.reviewId,
      });
    }
    if (input.expectedVersion !== undefined && response.version !== input.expectedVersion) {
      throw new ApiError("conflict", "Review response version conflict.", 409, {
        reviewId: input.reviewId,
        expectedVersion: input.expectedVersion,
        currentVersion: response.version,
      });
    }

    response.body = input.body;
    response.responder_user_id = input.responderUserId;
    response.version += 1;
    response.updated_at = input.now;
    return response;
  }

  createFlag(input: PartnerCreateReviewFlagInput) {
    this.assertReviewExists(input);
    const duplicatePendingFlag = this.store.reviewFlags.find(
      (flag) =>
        flag.review_id === input.reviewId &&
        flag.flagged_by_user_id === input.flaggedByUserId &&
        flag.status === "pending",
    );
    if (duplicatePendingFlag) {
      throw new ApiError("conflict", "Review already has a pending flag.", 409, {
        reviewId: input.reviewId,
      });
    }

    const flag = {
      id: `rflag_${crypto.randomUUID().replaceAll("-", "")}`,
      review_id: input.reviewId,
      facility_id: input.facilityId,
      flagged_by_user_id: input.flaggedByUserId,
      reason: input.reason,
      details: input.details,
      status: "pending" as const,
      resolver_user_id: null,
      resolution_note: null,
      resolved_at: null,
      created_at: input.now,
      updated_at: input.now,
    };
    this.store.reviewFlags.push(flag);
    return flag;
  }

  listPendingFlagsForReviews(reviewIds: string[]) {
    const ids = new Set(reviewIds);
    return this.store.reviewFlags.filter(
      (flag) => ids.has(flag.review_id) && flag.status === "pending",
    );
  }

  private assertReviewExists(input: PartnerFindFacilityReviewInput) {
    if (this.findForFacility(input)) {
      return;
    }
    throw new ApiError("not_found", "Review was not found.", 404, {
      facilityId: input.facilityId,
      reviewId: input.reviewId,
    });
  }
}
