import { describe, expect, it } from "vitest";
import { localSmokeScenarios } from "./smokeLocalStack";

describe("opt-in local stack smoke harness contract", () => {
	it("covers the required local Auth, database, and hosted-isolation boundaries", () => {
		expect(localSmokeScenarios).toEqual([
			"local-config-is-loopback-only",
			"health",
			"database-backed-search",
			"signup-email-capture",
			"verification",
			"login-session",
			"logout",
			"recovery-email-capture",
			"password-reset",
			"login-with-new-password",
		]);
	});
});
