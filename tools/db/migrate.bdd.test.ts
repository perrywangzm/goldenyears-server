import { describe, expect, it } from "vitest";
import { migrationDirectory } from "./migrate";

describe("database migration CLI BDD", () => {
	it("uses the existing server SQL migration directory as the only source", () => {
		expect(migrationDirectory).toMatch(/src\/db\/migrations$/);
		expect(migrationDirectory).not.toMatch(/supabase\/migrations/);
	});
});
