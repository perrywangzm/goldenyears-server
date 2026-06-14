import type { UserRow } from "../schema/types";
import type { InMemoryStore } from "./inMemoryStore";
import type { ActorRole } from "@/shared/request-context/context";

export class UserRepository {
  constructor(private readonly store: InMemoryStore) {}

  findByEmail(email: string): UserRow | undefined {
    return this.store.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
  }

  findById(id: string): UserRow | undefined {
    return this.store.users.find((user) => user.id === id);
  }

  rolesForUser(userId: string): ActorRole[] {
    const user = this.findById(userId);
    return user?.status === "active" ? ["family"] : [];
  }
}
