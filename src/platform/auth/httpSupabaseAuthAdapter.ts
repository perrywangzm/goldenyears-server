import type { SupabaseAuthConfig } from "@/platform/auth/createSupabaseAuthAdapter";
import { ApiError } from "@/shared/errors/apiError";
import type {
	SupabaseAuthIdentity,
	SupabaseAuthPort,
	SupabaseSignUpInput,
} from "./supabaseAuthPort";

type SupabaseAuthUser = {
	id: string;
	email?: string;
	email_confirmed_at?: string | null;
	user_metadata?: { display_name?: string; full_name?: string };
};

type SupabaseAuthResponse = {
	user?: SupabaseAuthUser;
	access_token?: string;
	error?: { message?: string; error_description?: string; code?: string };
	error_description?: string;
	code?: string;
	msg?: string;
};

type AuthOperation =
	| "login"
	| "logout"
	| "signup"
	| "email_verify"
	| "recovery_request"
	| "recovery_verify"
	| "password_update"
	| "verification_resend";

type RequestOptions = {
	method?: "POST" | "PUT";
	accessToken?: string;
	operation: AuthOperation;
	acknowledgeAccountAbsence?: boolean;
};

const DEFAULT_TIMEOUT_MS = 8_000;

export class HttpSupabaseAuthAdapter implements SupabaseAuthPort {
	private readonly timeoutMs: number;

	constructor(
		private readonly env: SupabaseAuthConfig & {
			SUPABASE_URL: string;
			SUPABASE_PUBLISHABLE_KEY: string;
		},
		private readonly fetcher: typeof fetch = (input, init) => fetch(input, init),
	) {
		const configuredTimeout = Number(env.SUPABASE_AUTH_REQUEST_TIMEOUT_MS);
		this.timeoutMs =
			Number.isFinite(configuredTimeout) && configuredTimeout > 0
				? Math.min(configuredTimeout, 30_000)
				: DEFAULT_TIMEOUT_MS;
	}

	async signInWithPassword(
		email: string,
		password: string,
	): Promise<SupabaseAuthIdentity> {
		const payload = await this.request(
			"/auth/v1/token?grant_type=password",
			{ email: email.toLowerCase(), password },
			{ operation: "login" },
		);
		const accessToken = payload.access_token;
		if (!accessToken) {
			throw new ApiError(
				"internal_error",
				"Authentication provider returned an incomplete response.",
				500,
			);
		}
		const identity = this.toIdentity(payload.user, email);
		await this.disposeProviderSession(accessToken);
		return identity;
	}

	async signUp(input: SupabaseSignUpInput): Promise<SupabaseAuthIdentity> {
		const payload = await this.request(
			this.withRedirect("/auth/v1/signup"),
			{
				email: input.email.toLowerCase(),
				password: input.password,
				data: input.displayName
					? { display_name: input.displayName }
					: undefined,
			},
			{ operation: "signup" },
		);
		return this.toIdentity(payload.user, input.email);
	}

	async requestPasswordReset(email: string): Promise<void> {
		await this.request(
			this.withRedirect("/auth/v1/recover"),
			{ email: email.toLowerCase() },
			{ operation: "recovery_request", acknowledgeAccountAbsence: true },
		);
	}

	async confirmEmailVerification(email: string, token: string): Promise<void> {
		const verification = await this.request(
			"/auth/v1/verify",
			{ type: "email", email: email.toLowerCase(), token },
			{ operation: "email_verify" },
		);
		if (!verification.access_token) {
			throw new ApiError(
				"unauthenticated",
				"That verification code is invalid or has expired.",
				401,
			);
		}
		await this.disposeProviderSession(verification.access_token);
	}

	async confirmPasswordReset(
		email: string,
		token: string,
		password: string,
	): Promise<void> {
		const verification = await this.request(
			"/auth/v1/verify",
			{ type: "recovery", email: email.toLowerCase(), token },
			{ operation: "recovery_verify" },
		);
		const accessToken = verification.access_token;
		if (!accessToken) {
			throw new ApiError(
				"unauthenticated",
				"That reset link is invalid or has expired.",
				401,
			);
		}
		await this.request(
			"/auth/v1/user",
			{ password },
			{ method: "PUT", accessToken, operation: "password_update" },
		);
		await this.disposeProviderSession(accessToken);
	}

	async resendVerificationEmail(email: string): Promise<void> {
		await this.request(
			this.withRedirect("/auth/v1/resend"),
			{ type: "signup", email: email.toLowerCase() },
			{ operation: "verification_resend", acknowledgeAccountAbsence: true },
		);
	}

	private async disposeProviderSession(accessToken: string): Promise<void> {
		await this.request("/auth/v1/logout?scope=local", undefined, {
			operation: "logout",
			accessToken,
		});
	}

	private async request(
		path: string,
		body: Record<string, unknown> | undefined,
		options: RequestOptions,
	): Promise<SupabaseAuthResponse> {
		const url = `${this.env.SUPABASE_URL.replace(/\/$/, "")}${path}`;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
		let response: Response;
		try {
			response = await this.fetcher(url, {
				method: options.method ?? "POST",
				headers: this.headers(options.accessToken),
				body: body === undefined ? undefined : JSON.stringify(body),
				signal: controller.signal,
			});
		} catch (error) {
			console.error("Supabase Auth request failed", {
				operation: options.operation,
				cause: error instanceof Error ? error.message : "Unknown fetch failure",
			});
			if (controller.signal.aborted) {
				throw new ApiError(
					"internal_error",
					"Authentication provider timed out.",
					500,
				);
			}
			throw new ApiError(
				"internal_error",
				"Authentication provider request failed.",
				500,
			);
		} finally {
			clearTimeout(timeout);
		}

		const payload = (await response
			.json()
			.catch(() => ({}))) as SupabaseAuthResponse;
		if (!response.ok || payload.error) {
			if (
				options.acknowledgeAccountAbsence &&
				response.status >= 400 &&
				response.status < 500 &&
				response.status !== 429
			) {
				return {};
			}
			throw this.mapAuthError(options.operation, response, payload);
		}
		return payload;
	}

	private headers(accessToken?: string) {
		const publishableKey = this.env.SUPABASE_PUBLISHABLE_KEY;
		return {
			apikey: publishableKey,
			Authorization: `Bearer ${accessToken ?? publishableKey}`,
			"Content-Type": "application/json",
		};
	}

	private withRedirect(path: string) {
		const redirect = this.env.SUPABASE_AUTH_REDIRECT_URL;
		if (!redirect) return path;
		return `${path}?redirect_to=${encodeURIComponent(redirect)}`;
	}

	private toIdentity(
		user: SupabaseAuthUser | undefined,
		fallbackEmail: string,
	): SupabaseAuthIdentity {
		if (!user?.id) {
			throw new ApiError("unauthenticated", "Invalid email or password.", 401);
		}
		return {
			authUserId: user.id,
			email: (user.email ?? fallbackEmail).toLowerCase(),
			emailVerified: Boolean(user.email_confirmed_at),
			displayName:
				user.user_metadata?.display_name ??
				user.user_metadata?.full_name ??
				null,
		};
	}

	private mapAuthError(
		operation: AuthOperation,
		response: Response,
		payload: SupabaseAuthResponse,
	) {
		const providerCode = payload.error?.code ?? payload.code;
		const providerMessage =
			payload.error?.message ?? payload.error_description ?? payload.msg ?? "";
		if (response.status === 429) {
			const retryAfter = Number(response.headers.get("Retry-After"));
			return new ApiError(
				"rate_limited",
				"Too many authentication attempts. Please try again later.",
				429,
				{
					retry_after_seconds: Number.isFinite(retryAfter)
						? retryAfter
						: undefined,
				},
			);
		}
		if (
			operation === "signup" &&
			(response.status === 409 || providerCode === "user_already_exists")
		) {
			return new ApiError(
				"conflict",
				"An account with this email already exists.",
				409,
			);
		}
		if (
			(operation === "signup" || operation === "password_update") &&
			/password/i.test(providerMessage)
		) {
			return new ApiError(
				"validation_failed",
				"Password does not meet security requirements.",
				422,
			);
		}
		if (
			operation === "recovery_verify" &&
			response.status >= 400 &&
			response.status < 500
		) {
			return new ApiError(
				"unauthenticated",
				"That reset link is invalid or has expired.",
				401,
			);
		}
		if (
			operation === "email_verify" &&
			response.status >= 400 &&
			response.status < 500
		) {
			return new ApiError(
				"unauthenticated",
				"That verification code is invalid or has expired.",
				401,
			);
		}
		if (
			operation === "login" &&
			response.status >= 400 &&
			response.status < 500
		) {
			return new ApiError("unauthenticated", "Invalid email or password.", 401);
		}
		return new ApiError(
			"internal_error",
			"Authentication provider request failed.",
			500,
		);
	}
}
