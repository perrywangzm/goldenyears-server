import { describe, expect, it } from "vitest";
import { runDevOrchestrationHarness } from "./devOrchestrationHarness";

describe("disposable dev orchestration acceptance harness", () => {
	it("drives the real local/remote entrypoint and catches its built-in mutants", async () => {
		const result = await runDevOrchestrationHarness({ silent: true });
		expect(result.completed).toEqual([
			"local/remote/local differential",
			"unsafe outputs have zero side effects",
			"symlink ancestors have zero side effects",
			"invalid remote input has zero side effects",
			"tracked wiring and capability boundary",
			"local lifecycle command ledger",
			"poisoned local status rejection",
			"local lifecycle failure ordering",
			"force backup and permissions",
			"write rollback on commit failure",
			"absent output rollback on temp failure",
			"foreground process coordination",
			"mutation self-checks",
		]);
		expect(result.mutantsCaught).toEqual([
			"remote lifecycle invocation",
			"frontend provider secret",
			"hosted local status",
			"swallowed foreground exit",
		]);
		expect(result.assertions).toBeGreaterThan(0);
	});
});
