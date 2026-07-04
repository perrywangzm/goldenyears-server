import type { InMemoryStore } from "./inMemoryStore";

export class CompanyUserRepository {
  constructor(private readonly store: InMemoryStore) {}

  listActiveForUser(userId: string) {
    const activeCompanyIds = new Set(
      this.store.companies.filter((company) => company.status === "active").map((company) => company.id),
    );
    return this.store.companyUsers.filter(
      (membership) =>
        membership.user_id === userId &&
        membership.status === "active" &&
        activeCompanyIds.has(membership.company_id),
    );
  }

  findActiveMembership(userId: string, companyId: string) {
    const company = this.store.companies.find(
      (candidate) => candidate.id === companyId && candidate.status === "active",
    );
    if (!company) return undefined;
    return this.store.companyUsers.find(
      (membership) =>
        membership.user_id === userId &&
        membership.company_id === companyId &&
        membership.status === "active",
    );
  }

  countActiveCompanies(userId: string) {
    return this.listActiveForUser(userId).length;
  }
}
