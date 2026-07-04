import type { InMemoryStore } from "./inMemoryStore";

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
}
