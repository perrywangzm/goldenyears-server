import { describe, expect, it } from "vitest";
import {
	buildUserMigrationInventory,
	type MigrationAppUser,
	selectMigrationCandidates,
} from "./supabaseUserMigration";

const users: MigrationAppUser[] = [
	{
		id: "usr_1",
		email: "linked@example.com",
		status: "active",
		auth_user_id: "auth_1",
	},
	{
		id: "usr_2",
		email: "invite@example.com",
		status: "active",
		auth_user_id: null,
	},
	{
		id: "usr_3",
		email: "existing@example.com",
		status: "active",
		auth_user_id: null,
	},
	{
		id: "usr_4",
		email: "disabled@example.com",
		status: "disabled",
		auth_user_id: null,
	},
];

describe("Feature: resumable Supabase user migration planning", () => {
	it("reports aggregate state without returning raw user records", () => {
		const inventory = buildUserMigrationInventory(users, [
			{ id: "auth_1", email: "linked@example.com" },
			{ id: "auth_3", email: "existing@example.com" },
		]);

		expect(inventory).toEqual({
			total: 4,
			linked: 1,
			unlinked_active: 2,
			unlinked_disabled: 1,
			duplicate_or_conflicting_email: 0,
			missing_email: 0,
			linked_missing_provider_identity: 0,
			linked_email_mismatch: 0,
		});
		expect(JSON.stringify(inventory)).not.toContain("@example.com");
	});

	it("selects only active unlinked users in stable resumable batches", () => {
		const candidates = selectMigrationCandidates(
			users,
			[{ id: "auth_3", email: "existing@example.com" }],
			{ after: "usr_1", limit: 2 },
		);

		expect(
			candidates.map(({ appUser, providerUser }) => [
				appUser.id,
				providerUser?.id ?? null,
			]),
		).toEqual([
			["usr_2", null],
			["usr_3", "auth_3"],
		]);
	});

	it("excludes ambiguous provider email matches from automatic linking", () => {
		const candidates = selectMigrationCandidates(
			users,
			[
				{ id: "auth_a", email: "existing@example.com" },
				{ id: "auth_b", email: "EXISTING@example.com" },
			],
			{ limit: 10 },
		);

		expect(candidates.map(({ appUser }) => appUser.id)).toEqual(["usr_2"]);
	});
});
