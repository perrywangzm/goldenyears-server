import type { SupabaseAuthPort } from "@/platform/auth/supabaseAuthPort";

export class AuthAccountService {
	constructor(private readonly supabaseAuth: SupabaseAuthPort) {}

	async signUp(input: {
		email: string;
		password: string;
		display_name?: string;
	}) {
		const identity = await this.supabaseAuth.signUp({
			email: input.email,
			password: input.password,
			displayName: input.display_name,
		});
		return {
			user: null,
			email: identity.email,
			email_verification_required: !identity.emailVerified,
		};
	}

	async requestPasswordReset(email: string) {
		await this.supabaseAuth.requestPasswordReset(email);
		return { email: email.toLowerCase() };
	}

	async confirmEmailVerification(email: string, token: string) {
		await this.supabaseAuth.confirmEmailVerification(email, token);
		return { email: email.toLowerCase() };
	}

	async confirmPasswordReset(input: {
		email: string;
		token: string;
		password: string;
	}) {
		await this.supabaseAuth.confirmPasswordReset(
			input.email,
			input.token,
			input.password,
		);
		return { email: input.email.toLowerCase() };
	}

	async resendVerificationEmail(email: string) {
		await this.supabaseAuth.resendVerificationEmail(email);
		return { email: email.toLowerCase() };
	}
}
