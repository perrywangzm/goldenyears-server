import type { Env } from "@/config/env";
import { ApiError } from "@/shared/errors/apiError";
import { HttpSupabaseAuthAdapter } from "./httpSupabaseAuthAdapter";
import type { SupabaseAuthPort } from "./supabaseAuthPort";

export type SupabaseAuthConfig = Pick<
	Env,
	| "SUPABASE_URL"
	| "SUPABASE_PUBLISHABLE_KEY"
	| "SUPABASE_AUTH_REDIRECT_URL"
	| "SUPABASE_AUTH_REQUEST_TIMEOUT_MS"
>;

export function requireSupabaseAuthConfig(env: Env): SupabaseAuthConfig & {
	SUPABASE_URL: string;
	SUPABASE_PUBLISHABLE_KEY: string;
} {
	const url = env.SUPABASE_URL?.trim();
	const publishableKey = env.SUPABASE_PUBLISHABLE_KEY?.trim();
	if (!url || !publishableKey) {
		throw new ApiError(
			"internal_error",
			"Authentication is temporarily unavailable.",
			500,
		);
	}
	return {
		SUPABASE_URL: url,
		SUPABASE_PUBLISHABLE_KEY: publishableKey,
		SUPABASE_AUTH_REDIRECT_URL: env.SUPABASE_AUTH_REDIRECT_URL?.trim(),
		SUPABASE_AUTH_REQUEST_TIMEOUT_MS: env.SUPABASE_AUTH_REQUEST_TIMEOUT_MS,
	};
}

export function createSupabaseAuthAdapter(env: Env): SupabaseAuthPort {
	return new HttpSupabaseAuthAdapter(requireSupabaseAuthConfig(env));
}
