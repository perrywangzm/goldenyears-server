import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
	type CoordinatedChild,
	coordinateChildren,
} from "./processCoordinator";

class FakeChild extends EventEmitter implements CoordinatedChild {
	exitCode: number | null = null;
	signalCode: NodeJS.Signals | null = null;
	kill = vi.fn((signal: NodeJS.Signals = "SIGTERM") => {
		this.signalCode = signal;
		queueMicrotask(() => this.emit("exit", null, signal));
		return true;
	});

	exit(code: number) {
		this.exitCode = code;
		this.emit("exit", code, null);
	}
}

describe("foreground process coordination BDD", () => {
	it("stops the sibling and propagates the first meaningful exit code", async () => {
		const wrangler = new FakeChild();
		const vite = new FakeChild();
		const result = coordinateChildren([wrangler, vite], {
			shutdownTimeoutMs: 50,
		});

		wrangler.exit(7);

		await expect(result).resolves.toBe(7);
		expect(vite.kill).toHaveBeenCalledWith("SIGTERM");
	});

	it("forwards terminal signals to every child without hanging", async () => {
		const wrangler = new FakeChild();
		const vite = new FakeChild();
		const signalSource = new EventEmitter();
		const result = coordinateChildren([wrangler, vite], {
			signalSource,
			shutdownTimeoutMs: 50,
		});

		signalSource.emit("SIGINT");

		await expect(result).resolves.toBe(130);
		expect(wrangler.kill).toHaveBeenCalledWith("SIGINT");
		expect(vite.kill).toHaveBeenCalledWith("SIGINT");
	});

	it("turns a child spawn error into a non-hanging failure", async () => {
		const missingCommand = new FakeChild();
		const sibling = new FakeChild();
		const result = coordinateChildren([missingCommand, sibling], {
			shutdownTimeoutMs: 50,
		});

		missingCommand.emit("error", new Error("ENOENT"));

		await expect(result).resolves.toBe(1);
		expect(sibling.kill).toHaveBeenCalledWith("SIGTERM");
	});
});
