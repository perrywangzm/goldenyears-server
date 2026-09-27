import type { FacilityRow } from "@/db/schema/types";
import { ApiError } from "@/shared/errors/apiError";
import type { InMemoryStore } from "./inMemoryStore";
import type {
	PartnerUpdateFacilityAvailabilityInput,
	PartnerUpdateFacilityListingFieldsInput,
	PartnerUpdateFacilityTourAvailabilityInput,
} from "./ports";

export class PartnerFacilityRepository {
  constructor(private readonly store: InMemoryStore) {}

  listAccessibleForUser(userId: string, input: { limit: number; offset: number }) {
    const activeCompanyIds = this.activeCompanyIdsForUser(userId);
    const accessible = this.store.facilities
      .filter((facility) => facility.company_id !== null && activeCompanyIds.has(facility.company_id))
      .sort((left, right) =>
        new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime() || left.id.localeCompare(right.id),
      );
    const rows = accessible.slice(input.offset, input.offset + input.limit);
    return {
      rows,
      total: accessible.length,
      hasMore: input.offset + rows.length < accessible.length,
    };
  }

  findAccessibleForUserAndFacility(userId: string, facilityId: string) {
    const activeCompanyIds = this.activeCompanyIdsForUser(userId);
    return this.store.facilities.find(
      (facility) =>
        facility.id === facilityId &&
        facility.company_id !== null &&
        activeCompanyIds.has(facility.company_id),
    );
  }

  updateManagerListingFields(input: PartnerUpdateFacilityListingFieldsInput) {
    const facility = this.findMutableFacility(input.facilityId);
    this.assertExpectedVersion(facility, input.expectedVersion);

    Object.assign(facility, input.patch);
    facility.version += 1;
    facility.updated_at = input.updatedAt;

    return facility;
  }

  updateAvailability(input: PartnerUpdateFacilityAvailabilityInput) {
    const facility = this.findMutableFacility(input.facilityId);
    this.assertExpectedVersion(facility, input.expectedVersion);

    facility.availability_status = input.status;
    facility.beds_available = input.bedsAvailable;
    facility.availability_note = input.note;
    facility.availability_updated_at = input.updatedAt;
    facility.version += 1;
    facility.updated_at = input.updatedAt;

    return facility;
  }

  updateTourAvailability(input: PartnerUpdateFacilityTourAvailabilityInput) {
    const facility = this.findMutableFacility(input.facilityId);
    this.assertExpectedVersion(facility, input.expectedVersion);

    facility.tour_availability = input.tourAvailability;
    facility.tour_availability_updated_at = input.updatedAt;
    facility.version += 1;
    facility.updated_at = input.updatedAt;

    return facility;
  }

  private activeCompanyIdsForUser(userId: string) {
    const activeCompanies = new Set(
      this.store.companies.filter((company) => company.status === "active").map((company) => company.id),
    );
    return new Set(
      this.store.companyUsers
        .filter(
          (membership) =>
            membership.user_id === userId &&
            membership.status === "active" &&
            activeCompanies.has(membership.company_id),
        )
        .map((membership) => membership.company_id),
    );
  }

  private findMutableFacility(facilityId: string) {
    const facility = this.store.facilities.find((row) => row.id === facilityId);
    if (!facility) {
      throw new ApiError("facility_not_found", "Facility was not found.", 404, {
        facilityId,
      });
    }
    return facility;
  }

  private assertExpectedVersion(facility: FacilityRow, expectedVersion?: number) {
    if (expectedVersion === undefined || facility.version === expectedVersion) {
      return;
    }
    throw new ApiError("conflict", "Facility version conflict.", 409, {
      facilityId: facility.id,
      expectedVersion,
      currentVersion: facility.version,
    });
  }
}
