import { describe, expect, it } from "vitest";
import { mockupDataDir } from "../seed-import/importMockupFixtures";
import {
	assertLocalSupabaseSafety,
	buildLocalBootstrapPlan,
	parseSupabaseStatus,
} from "./localSupabase";

describe("local Supabase BDD", () => {
	it("parses current publishable and secret key status fields", () => {
		expect(
			parseSupabaseStatus(
				JSON.stringify({
					API_URL: "http://127.0.0.1:54321",
					DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
					PUBLISHABLE_KEY: "publishable",
					SECRET_KEY: "secret",
					INBUCKET_URL: "http://127.0.0.1:54324",
				}),
			),
		).toMatchObject({
			publishableKey: "publishable",
			serviceRoleKey: "secret",
		});
	});

	it("supports legacy anon and service-role fields", () => {
		expect(
			parseSupabaseStatus(
				JSON.stringify({
					API_URL: "http://localhost:54321",
					DB_URL: "postgresql://postgres:postgres@localhost:54322/postgres",
					ANON_KEY: "anon",
					SERVICE_ROLE_KEY: "service-role",
					STUDIO_URL: "http://localhost:54323",
					INBUCKET_URL: "http://localhost:54324",
				}),
			),
		).toMatchObject({ publishableKey: "anon", serviceRoleKey: "service-role" });
	});

	it("rejects hosted endpoints and unexpected project IDs for destructive work", () => {
		expect(() =>
			assertLocalSupabaseSafety({
				projectId: "hosted-ref",
				apiUrl: "https://example.supabase.co",
				databaseUrl:
					"postgresql://postgres:password@db.example.supabase.co:5432/postgres",
			}),
		).toThrow(/local project/i);
	});

	it("plans migration before the idempotent mockup seed", () => {
		expect(buildLocalBootstrapPlan()).toEqual([
			{ command: "pnpm", args: ["db:migrate"] },
			{ command: "pnpm", args: ["seed:mockup"] },
		]);
		expect(mockupDataDir).toMatch(
			/goldenyears-project\/golden-years-mockup\/data$/,
		);
	});
});
