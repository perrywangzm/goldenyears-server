import type { UserRow } from "../schema/types";
import type { InMemoryStore } from "./inMemoryStore";
import type { ActorRole } from "@/shared/request-context/context";
import { ApiError } from "@/shared/errors/apiError";

export class UserRepository {
  constructor(private readonly store: InMemoryStore) {}

  findByEmail(email: string): UserRow | undefined {
    return this.store.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
  }

  findById(id: string): UserRow | undefined {
    return this.store.users.find((user) => user.id === id);
  }

  findByAuthUserId(authUserId: string): UserRow | undefined {
    return this.store.users.find((user) => user.auth_user_id === authUserId);
  }

  linkAuthUserId(userId: string, authUserId: string, patch?: { display_name?: string }): UserRow {
    const user = this.findById(userId);
    if (!user) {
      throw new Error(`User ${userId} was not found.`);
    }
    if (user.auth_user_id && user.auth_user_id !== authUserId) {
      throw new ApiError("conflict", "This account is linked to a different identity.", 409);
    }
    const identityOwner = this.findByAuthUserId(authUserId);
    if (identityOwner && identityOwner.id !== userId) {
      throw new ApiError("conflict", "This identity is linked to a different account.", 409);
    }
    user.auth_user_id = authUserId;
    if (patch?.display_name) {
      user.display_name = patch.display_name;
    }
    user.updated_at = new Date();
    return user;
  }

  createFromAuthIdentity(input: {
    auth_user_id: string;
    email: string;
    display_name: string;
    status: UserRow["status"];
  }): UserRow {
    if (this.findByAuthUserId(input.auth_user_id) || this.findByEmail(input.email)) {
      throw new ApiError("conflict", "This identity already has an account.", 409);
    }
    const now = new Date();
    const row: UserRow = {
      id: `usr_${crypto.randomUUID().replaceAll("-", "")}`,
      auth_user_id: input.auth_user_id,
      email: input.email.toLowerCase(),
      display_name: input.display_name,
      password_hash: null,
      status: input.status,
      created_at: now,
      updated_at: now,
    };
    this.store.users.push(row);
    return row;
  }

  updateProfile(userId: string, patch: { display_name?: string }): UserRow {
    const user = this.findById(userId);
    if (!user) {
      throw new Error(`User ${userId} was not found.`);
    }
    if (patch.display_name) {
      user.display_name = patch.display_name;
    }
    user.updated_at = new Date();
    return user;
  }

  rolesForUser(userId: string): ActorRole[] {
    const user = this.findById(userId);
    if (user?.status !== "active") return [];
    return this.store.userRoles
      .filter((role) => role.user_id === userId)
      .map((role) => role.role_id)
      .filter((role): role is Exclude<ActorRole, "anonymous"> =>
        role === "admin" || role === "moderator" || role === "cms_editor",
      );
  }
}
