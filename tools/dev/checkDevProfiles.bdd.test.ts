import { describe, expect, it } from "vitest";
import { checkDevProfiles } from "./checkDevProfiles";

describe("development profile guardrail eval", () => {
	it("keeps scripts, local ports, templates, migration ownership, and client origin aligned", async () => {
		await expect(checkDevProfiles()).resolves.toBeUndefined();
	});
});
