import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { createApiApp } from "@/interface/app";

function productionCorsOrigin() {
	const source = readFileSync(
		new URL("../../wrangler.jsonc", import.meta.url),
		"utf8",
	);
	const parsed = ts.parseConfigFileTextToJson("wrangler.jsonc", source);

	expect(parsed.error).toBeUndefined();

	const config = parsed.config as { vars?: { CORS_ORIGIN?: string } };
	return config.vars?.CORS_ORIGIN;
}

describe("Feature: Cloudflare surface routing configuration", () => {
	it("Scenario: The Worker accepts every marketplace and partner Pages origin", () => {
		const origins = productionCorsOrigin()
			?.split(",")
			.map((origin) => origin.trim());

		expect(origins).toEqual([
			"https://goldenyears.asia",
			"https://www.goldenyears.asia",
			"https://partners.goldenyears.asia",
			"https://golden-years-client-next.pages.dev",
			"https://golden-years-client-partners.pages.dev",
		]);
	});

	it("Scenario: Partner production and staging origins pass a CORS preflight", async () => {
		for (const origin of [
			"https://partners.goldenyears.asia",
			"https://golden-years-client-partners.pages.dev",
		]) {
			const response = await createApiApp().fetch(
				new Request("https://api.test/api/v1/get_health", {
					method: "OPTIONS",
					headers: {
						origin,
						"access-control-request-method": "POST",
					},
				}),
				{ CORS_ORIGIN: productionCorsOrigin() },
				{} as ExecutionContext,
			);

			expect(response.status).toBe(204);
			expect(response.headers.get("access-control-allow-origin")).toBe(origin);
		}
	});
});
