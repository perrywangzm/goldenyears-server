import type { Repositories } from "@/db/repositories/ports";
import type { UserRow } from "@/db/schema/types";
import type { SupabaseAuthIdentity } from "@/platform/auth/supabaseAuthPort";
import { ApiError } from "@/shared/errors/apiError";

export class IdentityProvisioningService {
	constructor(
		private readonly repos: Repositories,
		private readonly options: { allowEmailLinking?: boolean } = {},
	) {}

	async resolveOrProvision(identity: SupabaseAuthIdentity): Promise<UserRow> {
		if (!identity.emailVerified) {
			throw new ApiError(
				"unauthenticated",
				"Email verification is required.",
				401,
			);
		}

		const byAuthUserId = await this.repos.users.findByAuthUserId(
			identity.authUserId,
		);
		if (byAuthUserId) {
			return this.syncProfile(byAuthUserId, identity);
		}

		const byEmail = await this.repos.users.findByEmail(identity.email);
		if (byEmail) {
			if (
				byEmail.auth_user_id &&
				byEmail.auth_user_id !== identity.authUserId
			) {
				throw new ApiError(
					"conflict",
					"This email is linked to a different identity.",
					409,
				);
			}
			if (!this.options.allowEmailLinking) {
				throw new ApiError(
					"conflict",
					"This account requires migration support before sign-in.",
					409,
				);
			}
			const linked = await this.repos.users.linkAuthUserId(
				byEmail.id,
				identity.authUserId,
				{
					display_name: identity.displayName ?? byEmail.display_name,
				},
			);
			await this.repos.audit.write({
				id: `audit_${crypto.randomUUID()}`,
				actor_user_id: linked.id,
				action: "auth.identity_linked_by_verified_email",
				resource_type: "user",
				resource_id: linked.id,
				metadata: { auth_user_id: identity.authUserId },
				created_at: new Date(),
			});
			return linked;
		}

		try {
			return await this.repos.users.createFromAuthIdentity({
				auth_user_id: identity.authUserId,
				email: identity.email,
				display_name:
					identity.displayName ?? identity.email.split("@")[0] ?? "User",
				status: "active",
			});
		} catch (error) {
			const concurrent = await this.repos.users.findByAuthUserId(
				identity.authUserId,
			);
			if (concurrent) return this.syncProfile(concurrent, identity);
			const conflictingEmail = await this.repos.users.findByEmail(
				identity.email,
			);
			if (conflictingEmail?.auth_user_id === identity.authUserId) {
				return this.syncProfile(conflictingEmail, identity);
			}
			if (conflictingEmail) {
				throw new ApiError(
					"conflict",
					"This email is linked to a different identity.",
					409,
				);
			}
			throw error;
		}
	}

	private async syncProfile(
		user: UserRow,
		identity: SupabaseAuthIdentity,
	): Promise<UserRow> {
		if (identity.displayName && identity.displayName !== user.display_name) {
			return this.repos.users.updateProfile(user.id, {
				display_name: identity.displayName,
			});
		}
		return user;
	}
}
