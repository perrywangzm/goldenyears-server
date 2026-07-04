export type SupabaseAuthIdentity = {
	authUserId: string;
	email: string;
	emailVerified: boolean;
	displayName: string | null;
};

export type SupabaseSignUpInput = {
	email: string;
	password: string;
	displayName?: string;
};

export interface SupabaseAuthPort {
	signInWithPassword(
		email: string,
		password: string,
	): Promise<SupabaseAuthIdentity>;
	signUp(input: SupabaseSignUpInput): Promise<SupabaseAuthIdentity>;
	confirmEmailVerification(email: string, token: string): Promise<void>;
	requestPasswordReset(email: string): Promise<void>;
	confirmPasswordReset(
		email: string,
		token: string,
		password: string,
	): Promise<void>;
	resendVerificationEmail(email: string): Promise<void>;
}
