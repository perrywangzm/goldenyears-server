import { describe, expect, it } from "vitest";
import { createAuthServices } from "@/application/auth/createAuthServices";
import { createAsyncInMemoryRepositories } from "@/db/repositories";
import { createSupabaseAuthAdapter } from "@/platform/auth/createSupabaseAuthAdapter";
import { FakeSupabaseAuthAdapter } from "@/shared/testing/fakeSupabaseAuthAdapter";

describe("Feature: Supabase Auth adapter construction", () => {
	it("supabase-contract:missing-config-fails-closed", () => {
		expect(() => createSupabaseAuthAdapter({})).toThrowError(
			expect.objectContaining({ code: "internal_error", status: 500 }),
		);
		expect(() =>
			createSupabaseAuthAdapter({
				SUPABASE_URL: "https://example.supabase.co",
			}),
		).toThrowError(
			expect.objectContaining({ code: "internal_error", status: 500 }),
		);
	});

	it("supabase-contract:test-adapter-requires-explicit-injection", () => {
		const fake = new FakeSupabaseAuthAdapter();
		const services = createAuthServices(
			{},
			createAsyncInMemoryRepositories(),
			fake,
		);

		expect(services.supabaseAuth).toBe(fake);
	});
});
