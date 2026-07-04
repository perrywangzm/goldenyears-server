import { beforeEach, describe, expect, it } from "vitest";
import { IdentityProvisioningService } from "@/application/auth/identityProvisioningService";
import {
	createAsyncInMemoryRepositories,
	createRepositories,
} from "@/db/repositories";
import { resetInMemoryStore } from "@/db/repositories/inMemoryStore";

describe("Feature: Supabase identity provisioning", () => {
	beforeEach(() => {
		resetInMemoryStore();
	});

	it("supabase-contract:auth-user-id-match-wins", async () => {
		const repos = createAsyncInMemoryRepositories();
		const service = new IdentityProvisioningService(repos);

		const user = await service.resolveOrProvision({
			authUserId: "a1000000-0000-4000-8000-000000000001",
			email: "family@example.com",
			emailVerified: true,
			displayName: "Family Demo",
		});

		expect(user.id).toBe("usr_family_demo");
		expect(user.auth_user_id).toBe("a1000000-0000-4000-8000-000000000001");
	});

	it("supabase-contract:verified-email-migration-link", async () => {
		const { store } = createRepositories();
		const legacyUser = store.users.find(
			(user) => user.id === "usr_family_demo",
		);
		if (!legacyUser) throw new Error("Expected legacy demo user.");
		legacyUser.auth_user_id = null;

		const repos = createAsyncInMemoryRepositories();
		const service = new IdentityProvisioningService(repos, {
			allowEmailLinking: true,
		});

		const user = await service.resolveOrProvision({
			authUserId: "b2000000-0000-4000-8000-000000000099",
			email: "family@example.com",
			emailVerified: true,
			displayName: "Family Demo",
		});

		expect(user.id).toBe("usr_family_demo");
		expect(user.auth_user_id).toBe("b2000000-0000-4000-8000-000000000099");
		expect(createRepositories().store.auditEvents).toEqual([
			expect.objectContaining({
				action: "auth.identity_linked_by_verified_email",
				resource_id: "usr_family_demo",
			}),
		]);
	});

	it("supabase-contract:unverified-email-link-rejected", async () => {
		const repos = createAsyncInMemoryRepositories();
		const service = new IdentityProvisioningService(repos, {
			allowEmailLinking: true,
		});

		await expect(
			service.resolveOrProvision({
				authUserId: "b2000000-0000-4000-8000-000000000099",
				email: "family@example.com",
				emailVerified: false,
				displayName: "Family Demo",
			}),
		).rejects.toMatchObject({ code: "unauthenticated", status: 401 });
	});

	it("supabase-contract:different-auth-user-id-conflicts", async () => {
		const repos = createAsyncInMemoryRepositories();
		const service = new IdentityProvisioningService(repos);

		await expect(
			service.resolveOrProvision({
				authUserId: "d4000000-0000-4000-8000-000000000001",
				email: "family@example.com",
				emailVerified: true,
				displayName: "Someone Else",
			}),
		).rejects.toMatchObject({ code: "conflict", status: 409 });
	});

	it("Scenario: Unknown Supabase identity creates a new app profile row", async () => {
		const repos = createAsyncInMemoryRepositories();
		const service = new IdentityProvisioningService(repos);

		const user = await service.resolveOrProvision({
			authUserId: "c3000000-0000-4000-8000-000000000001",
			email: "new-user@example.com",
			emailVerified: true,
			displayName: "New User",
		});

		expect(user.id).toMatch(/^usr_/);
		expect(user.auth_user_id).toBe("c3000000-0000-4000-8000-000000000001");
		expect(user.email).toBe("new-user@example.com");
		expect(user.password_hash).toBeNull();
	});
});
