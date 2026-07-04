import type { SessionRow } from "../schema/types";
import type { SessionAudience } from "@/shared/authz/sessionAudience";
import type { InMemoryStore } from "./inMemoryStore";

export class SessionRepository {
  constructor(private readonly store: InMemoryStore) {}

  create(session: SessionRow) {
    this.store.sessions.push(session);
    return session;
  }

  findActiveByTokenHash(tokenHash: string, audience: SessionAudience, now = new Date()) {
    return this.store.sessions.find(
      (session) =>
        session.token_hash === tokenHash &&
        session.audience === audience &&
        !session.revoked_at &&
        new Date(session.expires_at) > now,
    );
  }

  revoke(sessionId: string, now = new Date()) {
    const session = this.store.sessions.find((entry) => entry.id === sessionId);
    if (session) {
      session.revoked_at = now;
    }
  }
}
