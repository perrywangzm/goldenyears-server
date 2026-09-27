import type { TourRequestRow } from "../schema/types";
import type { InMemoryStore } from "./inMemoryStore";
import { ApiError } from "@/shared/errors/apiError";
import type {
	PartnerFindFacilityTourRequestInput,
	PartnerListFacilityTourRequestsInput,
	PartnerTourSummary,
	PartnerUpdateTourRequestStatusInput,
} from "./ports";

export class TourRepository {
  constructor(private readonly store: InMemoryStore) {}

  create(row: TourRequestRow) {
    this.store.tourRequests.push(row);
    return row;
  }

  listForUser(userId: string) {
    return this.store.tourRequests
      .filter((tour) => tour.user_id === userId)
      .toSorted((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  countForUser(userId: string) {
    return this.store.tourRequests.filter((tour) => tour.user_id === userId).length;
  }

  listForFacility(input: PartnerListFacilityTourRequestsInput) {
    const matching = this.store.tourRequests
      .filter(
        (tour) =>
          tour.facility_id === input.facilityId &&
          (!input.statuses || input.statuses.includes(tour.status)),
      )
      .toSorted(
        (left, right) =>
          new Date(right.created_at).getTime() -
            new Date(left.created_at).getTime() || left.id.localeCompare(right.id),
      );
    const rows = matching.slice(input.offset, input.offset + input.limit);
    return {
      rows,
      total: matching.length,
      hasMore: input.offset + rows.length < matching.length,
    };
  }

  findForFacility(input: PartnerFindFacilityTourRequestInput) {
    return this.store.tourRequests.find(
      (tour) =>
        tour.id === input.tourRequestId && tour.facility_id === input.facilityId,
    );
  }

  updateStatus(input: PartnerUpdateTourRequestStatusInput) {
    const tour = this.findForFacility(input);
    if (!tour) {
      throw new ApiError("not_found", "Tour request was not found.", 404, {
        facilityId: input.facilityId,
        tourRequestId: input.tourRequestId,
      });
    }
    if (input.expectedVersion !== undefined && tour.version !== input.expectedVersion) {
      throw new ApiError("conflict", "Tour request version conflict.", 409, {
        tourRequestId: input.tourRequestId,
        expectedVersion: input.expectedVersion,
        currentVersion: tour.version,
      });
    }

    tour.status = input.status;
    tour.version += 1;
    tour.updated_at = input.updatedAt;
    if (input.scheduledDate !== undefined) {
      tour.scheduled_date = input.scheduledDate;
    }
    if (input.scheduledTime !== undefined) {
      tour.scheduled_time = input.scheduledTime;
    }
    if (input.partnerMessage !== undefined) {
      tour.partner_message = input.partnerMessage;
    }
    return tour;
  }

  summarizeForFacility(facilityId: string): PartnerTourSummary {
    const summary: PartnerTourSummary = {
      pending_review: 0,
      confirmed: 0,
      attended: 0,
      no_show: 0,
      declined: 0,
      cancelled: 0,
    };
    for (const tour of this.store.tourRequests) {
      if (tour.facility_id === facilityId) {
        summary[tour.status] += 1;
      }
    }
    return summary;
  }
}
