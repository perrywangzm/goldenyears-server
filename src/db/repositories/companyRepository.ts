import type { InMemoryStore } from "./inMemoryStore";

export class CompanyRepository {
  constructor(private readonly store: InMemoryStore) {}

  findById(id: string) {
    return this.store.companies.find((company) => company.id === id);
  }

  listActiveForUser(userId: string) {
    const activeCompanyIds = new Set(
      this.store.companyUsers
        .filter((membership) => membership.user_id === userId && membership.status === "active")
        .map((membership) => membership.company_id),
    );
    return this.store.companies.filter(
      (company) => company.status === "active" && activeCompanyIds.has(company.id),
    );
  }
}
