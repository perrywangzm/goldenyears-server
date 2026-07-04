import type {
	SupabaseAuthIdentity,
	SupabaseAuthPort,
	SupabaseSignUpInput,
} from "@/platform/auth/supabaseAuthPort";
import { ApiError } from "@/shared/errors/apiError";

const seededIdentities: SupabaseAuthIdentity[] = [
	{
		authUserId: "a1000000-0000-4000-8000-000000000001",
		email: "family@example.com",
		emailVerified: true,
		displayName: "Family Demo",
	},
	{
		authUserId: "a1000000-0000-4000-8000-000000000002",
		email: "partner@example.com",
		emailVerified: true,
		displayName: "Partner Operator",
	},
	{
		authUserId: "a1000000-0000-4000-8000-000000000003",
		email: "admin@example.com",
		emailVerified: true,
		displayName: "Admin Demo",
	},
];

/** Explicit test dependency. Production adapter selection never imports this fake. */
export class FakeSupabaseAuthAdapter implements SupabaseAuthPort {
	private readonly identities = new Map(
		seededIdentities.map((identity) => [identity.email, identity]),
	);

	async signInWithPassword(
		email: string,
		password: string,
	): Promise<SupabaseAuthIdentity> {
		const identity = this.identities.get(email.toLowerCase());
		if (!identity || password !== "password") {
			throw new ApiError("unauthenticated", "Invalid email or password.", 401);
		}
		return identity;
	}

	async signUp(input: SupabaseSignUpInput): Promise<SupabaseAuthIdentity> {
		const email = input.email.toLowerCase();
		if (this.identities.has(email)) {
			throw new ApiError(
				"conflict",
				"An account with this email already exists.",
				409,
			);
		}
		const identity: SupabaseAuthIdentity = {
			authUserId: crypto.randomUUID(),
			email,
			emailVerified: false,
			displayName: input.displayName?.trim() || email.split("@")[0] || "User",
		};
		this.identities.set(email, identity);
		return identity;
	}

	async requestPasswordReset(_email: string): Promise<void> {}

	async confirmEmailVerification(
		_email: string,
		_token: string,
	): Promise<void> {}

	async confirmPasswordReset(
		_email: string,
		_token: string,
		_password: string,
	): Promise<void> {}

	async resendVerificationEmail(_email: string): Promise<void> {}
}
