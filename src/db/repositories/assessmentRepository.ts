import type { AssessmentResultRow } from "@/db/schema/assessmentTypes";
import type { InMemoryStore } from "./inMemoryStore";

export type CreateAssessmentResultInput = Omit<AssessmentResultRow, "created_at">;

export type AssessmentOwnerScope = {
  user_id: string | null;
  owner_session_id: string | null;
};

export class AssessmentRepository {
  constructor(private readonly store: InMemoryStore) {}

  create(input: CreateAssessmentResultInput): AssessmentResultRow {
    this.clearLatestForOwner(input.user_id, input.owner_session_id);
    const row: AssessmentResultRow = {
      ...input,
      created_at: new Date(),
    };
    this.store.assessmentResults.push(row);
    return row;
  }

  findLatestForOwner(input: AssessmentOwnerScope) {
    return this.store.assessmentResults.find(
      (row) =>
        row.is_latest &&
        ((input.user_id && row.user_id === input.user_id) ||
          (!input.user_id && input.owner_session_id && row.owner_session_id === input.owner_session_id)),
    );
  }

  findById(id: string) {
    return this.store.assessmentResults.find((row) => row.id === id);
  }

  deleteLatestForOwner(input: AssessmentOwnerScope): { id: string } | null {
    const row = this.findLatestForOwner(input);
    if (!row) return null;
    row.is_latest = false;
    return { id: row.id };
  }

  claimAnonymousSession(anonymousSessionId: string, userId: string, sessionId: string | null): boolean {
    const row = this.store.assessmentResults.find(
      (entry) => entry.is_latest && entry.user_id === null && entry.owner_session_id === anonymousSessionId,
    );
    if (!row) return false;
    this.clearLatestForOwner(userId, sessionId);
    row.user_id = userId;
    row.owner_session_id = sessionId;
    row.is_latest = true;
    return true;
  }

  private clearLatestForOwner(userId: string | null, ownerSessionId: string | null) {
    for (const row of this.store.assessmentResults) {
      if (!row.is_latest) continue;
      if (userId && row.user_id === userId) row.is_latest = false;
      if (!userId && ownerSessionId && row.owner_session_id === ownerSessionId) row.is_latest = false;
    }
  }
}
