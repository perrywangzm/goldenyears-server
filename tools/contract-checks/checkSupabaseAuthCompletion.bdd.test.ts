import { describe, expect, it } from "vitest";
import {
	completionContractIsDecisionComplete,
	frontendHasCanonicalAuthInventory,
	frontendHasCentralCsrfInventory,
	productionFactoryFailsClosed,
	providerSessionIsDisposed,
	recoveryFlowIsTwoStep,
	scenarioContractResult,
	signupDefersProfileLinking,
	verifiedEmailGuardPrecedesFallback,
} from "./checkSupabaseAuthCompletion";

describe("Feature: Supabase Auth completion harness", () => {
	it("rejects a production factory that silently falls back to legacy password auth", () => {
		expect(
			productionFactoryFailsClosed(`
        if (env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY) return new HttpSupabaseAuthAdapter(env);
        return new DevSupabaseAuthAdapter(lookupUserByEmail);
      `),
		).toBe(false);

		expect(
			productionFactoryFailsClosed(`
        const config = requireSupabaseAuthConfig(env);
        return new HttpSupabaseAuthAdapter(config);
      `),
		).toBe(true);
	});

	it("requires verified email before the migration fallback reads an app user by email", () => {
		expect(
			verifiedEmailGuardPrecedesFallback(`
        const byEmail = await repos.users.findByEmail(identity.email);
        if (!identity.emailVerified) throw new Error("unverified");
      `),
		).toBe(false);

		expect(
			verifiedEmailGuardPrecedesFallback(`
        if (!identity.emailVerified) throw new Error("verified email required");
        const byEmail = await repos.users.findByEmail(identity.email);
      `),
		).toBe(true);
	});

	it("requires signup to defer app profile linking until verified authentication", () => {
		expect(
			signupDefersProfileLinking(`
        async signUp(input) {
          const identity = await this.auth.signUp(input);
          return this.identityProvisioning.resolveOrProvision(identity);
        }
        async requestPasswordReset() {}
      `),
		).toBe(false);

		expect(
			signupDefersProfileLinking(`
        async signUp(input) {
          await this.auth.signUp(input);
          return { email_verification_required: true };
        }
        async requestPasswordReset() {}
      `),
		).toBe(true);
	});

	it("rejects password-in-verify recovery and accepts verify-then-update recovery", () => {
		expect(
			recoveryFlowIsTwoStep(`
        async confirmPasswordReset(email, token, password) {
          await this.request("/auth/v1/verify", { type: "recovery", email, token, password });
        }
        async resendVerificationEmail() {}
      `),
		).toBe(false);

		expect(
			recoveryFlowIsTwoStep(`
        async confirmPasswordReset(email, token, password) {
          const { access_token } = await this.request(
            "/auth/v1/verify",
            { type: "recovery", email, token },
            { operation: "recovery_verify" },
          );
          await this.request("/auth/v1/user", { password }, access_token);
        }
        async resendVerificationEmail() {}
      `),
		).toBe(true);
	});

	it("requires password login to dispose of the temporary provider session", () => {
		expect(
			providerSessionIsDisposed(`
        async signInWithPassword(email, password) {
          const payload = await this.request("/auth/v1/token", { email, password });
          return payload.user;
        }
        async signUp() {}
      `),
		).toBe(false);

		expect(
			providerSessionIsDisposed(`
        async signInWithPassword(email, password) {
          const payload = await this.request("/auth/v1/token", { email, password });
          await this.revokeProviderSession(payload.access_token);
          return payload.user;
        }
        async signUp() {}
        async revokeProviderSession(accessToken) {
          await this.request("/auth/v1/logout?scope=local", {}, accessToken);
        }
      `),
		).toBe(true);
	});

	it("requires the complete canonical frontend auth route inventory", () => {
		const complete = `
      /api/v1/user/auth/login
      /api/v1/user/auth/logout
      /api/v1/user/auth/signup
      /api/v1/user/auth/confirm_verification
      /api/v1/user/auth/request_password_reset
      /api/v1/user/auth/confirm_password_reset
      /api/v1/user/auth/resend_verification
    `;
		expect(frontendHasCanonicalAuthInventory(complete)).toBe(true);
		expect(
			frontendHasCanonicalAuthInventory(
				complete.replace("/api/v1/user/auth/resend_verification", ""),
			),
		).toBe(false);
		expect(
			frontendHasCanonicalAuthInventory(`${complete}\n/api/v1/create_session`),
		).toBe(false);
	});

	it("requires a central CSRF inventory containing every known user mutation", () => {
		const inventory = `
      /api/v1/user/auth/logout
      /create_saved_facility
      /create_tour_request
      /create_assessment_result
      /delete_latest_assessment_result
    `;
		expect(
			frontendHasCentralCsrfInventory(
				inventory,
				"postUserMutationJson(path, body)",
			),
		).toBe(true);
		expect(
			frontendHasCentralCsrfInventory(
				inventory.replace("/create_tour_request", ""),
				"postUserMutationJson(path, body)",
			),
		).toBe(false);
	});

	it("accepts scenario IDs only from their assigned test file", () => {
		const files: Record<string, string> = {
			"expected.test.ts": 'it("supabase-contract:expected-case", () => {})',
			"unrelated.test.ts": 'it("supabase-contract:missing-case", () => {})',
		};
		const reader = { read: (file: string) => files[file] ?? "" };

		expect(
			scenarioContractResult(
				reader,
				{ "expected.test.ts": ["supabase-contract:expected-case"] },
				"sample",
			).status,
		).toBe("pass");
		expect(
			scenarioContractResult(
				reader,
				{ "expected.test.ts": ["supabase-contract:missing-case"] },
				"sample",
			).status,
		).toBe("fail");
	});

	it("does not accept a scenario ID that appears only in a comment", () => {
		const reader = { read: () => "// supabase-contract:comment-only" };
		expect(
			scenarioContractResult(
				reader,
				{ "expected.test.ts": ["supabase-contract:comment-only"] },
				"sample",
			).status,
		).toBe("fail");
	});

	it("accepts normal prose variants for the decision-complete documentation contract", () => {
		const decisions = `
      Runtime configuration fails closed.
      Linking requires a verified email.
      Exchange the recovery token before update.
      Dispose of the provider-session.
      Return a generic acknowledgement.
      Use SUPABASE_PUBLISHABLE_KEY.
    `;
		expect(completionContractIsDecisionComplete(decisions)).toBe(true);
		expect(
			completionContractIsDecisionComplete(
				decisions.replace("generic acknowledgement", "success"),
			),
		).toBe(false);
	});
});
