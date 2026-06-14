import type { Repositories } from "@/db/repositories/ports";

export class ReferenceService {
  constructor(private readonly repos: Repositories) {}

  getSearchOptions() {
    return this.repos.references.getSearchOptions();
  }
}
