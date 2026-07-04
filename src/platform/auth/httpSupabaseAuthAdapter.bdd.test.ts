import { describe, expect, it, vi } from "vitest";
import { HttpSupabaseAuthAdapter } from "@/platform/auth/httpSupabaseAuthAdapter";

const config = {
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
	SUPABASE_AUTH_REDIRECT_URL: "https://www.goldenyears.asia/auth/callback",
};

function response(body: unknown, status = 200, headers?: HeadersInit) {
	return new Response(status === 204 ? null : JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", ...headers },
	});
}

describe("Feature: Supabase Auth HTTP protocol", () => {
	it("supabase-contract:password-login-revokes-provider-session", async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				response({
					access_token: "provider_access_token",
					refresh_token: "provider_refresh_token",
					user: {
						id: "auth-user-id",
						email: "family@example.com",
						email_confirmed_at: "2026-07-04T00:00:00Z",
					},
				}),
			)
			.mockResolvedValueOnce(response({}, 200));
		const adapter = new HttpSupabaseAuthAdapter(config, fetcher);

		await expect(
			adapter.signInWithPassword("Family@Example.com", "secret"),
		).resolves.toMatchObject({
			authUserId: "auth-user-id",
			email: "family@example.com",
			emailVerified: true,
		});

		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(fetcher.mock.calls[1]?.[0]).toBe(
			"https://example.supabase.co/auth/v1/logout?scope=local",
		);
		const logoutInit = fetcher.mock.calls[1]?.[1];
		expect(new Headers(logoutInit?.headers).get("Authorization")).toBe(
			"Bearer provider_access_token",
		);
		expect(new Headers(logoutInit?.headers).get("apikey")).toBe(
			"sb_publishable_test",
		);
	});

	it("supabase-contract:recovery-verifies-before-password-update", async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				response({ access_token: "recovery_access_token" }),
			)
			.mockResolvedValueOnce(response({ user: { id: "auth-user-id" } }))
			.mockResolvedValueOnce(response({}));
		const adapter = new HttpSupabaseAuthAdapter(config, fetcher);

		await adapter.confirmPasswordReset(
			"Family@Example.com",
			"123456",
			"new-password",
		);

		expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
			"https://example.supabase.co/auth/v1/verify",
			"https://example.supabase.co/auth/v1/user",
			"https://example.supabase.co/auth/v1/logout?scope=local",
		]);
		expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
			type: "recovery",
			email: "family@example.com",
			token: "123456",
		});
		expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
			password: "new-password",
		});
		expect(
			new Headers(fetcher.mock.calls[1]?.[1]?.headers).get("Authorization"),
		).toBe("Bearer recovery_access_token");
	});

	it("supabase-contract:auth-errors-map-by-operation", async () => {
		const invalidLogin = new HttpSupabaseAuthAdapter(
			config,
			vi
				.fn<typeof fetch>()
				.mockResolvedValue(response({ code: "invalid_credentials" }, 400)),
		);
		await expect(
			invalidLogin.signInWithPassword("user@example.com", "bad"),
		).rejects.toMatchObject({
			code: "unauthenticated",
			status: 401,
			message: "Invalid email or password.",
		});

		const weakSignup = new HttpSupabaseAuthAdapter(
			config,
			vi
				.fn<typeof fetch>()
				.mockResolvedValue(
					response({ msg: "Password should be at least 8 characters" }, 422),
				),
		);
		await expect(
			weakSignup.signUp({ email: "user@example.com", password: "short" }),
		).rejects.toMatchObject({
			code: "validation_failed",
			status: 422,
		});

		const expiredRecovery = new HttpSupabaseAuthAdapter(
			config,
			vi
				.fn<typeof fetch>()
				.mockResolvedValue(response({ code: "otp_expired" }, 403)),
		);
		await expect(
			expiredRecovery.confirmPasswordReset(
				"user@example.com",
				"old",
				"new-password",
			),
		).rejects.toMatchObject({
			code: "unauthenticated",
			status: 401,
		});
	});

	it("supabase-contract:rate-limit-preserves-retryable-error", async () => {
		const adapter = new HttpSupabaseAuthAdapter(
			config,
			vi
				.fn<typeof fetch>()
				.mockResolvedValue(response({}, 429, { "Retry-After": "45" })),
		);

		await expect(
			adapter.signInWithPassword("user@example.com", "secret"),
		).rejects.toMatchObject({
			code: "rate_limited",
			status: 429,
			details: { retry_after_seconds: 45 },
		});
	});

	it("verifies signup email by OTP and revokes the temporary verification session", async () => {
		const fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				response({ access_token: "verification_access_token" }),
			)
			.mockResolvedValueOnce(response({}));
		const adapter = new HttpSupabaseAuthAdapter(config, fetcher);

		await adapter.confirmEmailVerification("Family@Example.com", "123456");

		expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
			type: "email",
			email: "family@example.com",
			token: "123456",
		});
		expect(fetcher.mock.calls[1]?.[0]).toContain("/auth/v1/logout?scope=local");
	});
});
