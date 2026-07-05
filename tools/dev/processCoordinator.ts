import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";

export interface CoordinatedChild extends EventEmitter {
	exitCode: number | null;
	signalCode: NodeJS.Signals | null;
	kill(signal?: NodeJS.Signals): boolean;
}

export interface ChildSpec {
	command: string;
	args: string[];
	cwd: string;
	env?: NodeJS.ProcessEnv;
}

const signalExitCodes: Partial<Record<NodeJS.Signals, number>> = {
	SIGHUP: 129,
	SIGINT: 130,
	SIGTERM: 143,
	SIGKILL: 137,
};

function exitCodeForSignal(signal: NodeJS.Signals | null): number {
	return signal ? (signalExitCodes[signal] ?? 1) : 1;
}

function waitForExit(child: CoordinatedChild) {
	if (child.exitCode !== null || child.signalCode !== null) {
		return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
	}
	return new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
		(resolve) => {
			const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
				child.removeListener("error", onError);
				resolve({ code, signal });
			};
			const onError = () => {
				child.removeListener("exit", onExit);
				resolve({ code: 1, signal: null });
			};
			child.once("exit", onExit);
			child.once("error", onError);
		},
	);
}

function delay(milliseconds: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function isRunning(child: CoordinatedChild) {
	return child.exitCode === null && child.signalCode === null;
}

export async function coordinateChildren(
	children: CoordinatedChild[],
	options: { signalSource?: EventEmitter; shutdownTimeoutMs?: number } = {},
): Promise<number> {
	if (children.length === 0) return 0;
	const signalSource = options.signalSource ?? process;
	const shutdownTimeoutMs = options.shutdownTimeoutMs ?? 5_000;
	const exitPromises = children.map((child, index) =>
		waitForExit(child).then((result) => ({ ...result, index })),
	);

	let resolveSignal!: (signal: NodeJS.Signals) => void;
	const signalPromise = new Promise<{ signal: NodeJS.Signals }>((resolve) => {
		resolveSignal = (signal) => resolve({ signal });
	});
	const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
	const handlers = new Map<NodeJS.Signals, () => void>();
	for (const signal of signals) {
		const handler = () => resolveSignal(signal);
		handlers.set(signal, handler);
		signalSource.once(signal, handler);
	}

	try {
		const first = await Promise.race([
			...exitPromises.map((promise) =>
				promise.then((result) => ({ kind: "exit" as const, result })),
			),
			signalPromise.then((result) => ({ kind: "signal" as const, result })),
		]);

		const forwardedSignal =
			first.kind === "signal" ? first.result.signal : "SIGTERM";
		for (const child of children) {
			if (isRunning(child)) child.kill(forwardedSignal);
		}

		const settled = Promise.allSettled(exitPromises);
		await Promise.race([settled, delay(shutdownTimeoutMs)]);
		for (const child of children) {
			if (isRunning(child)) child.kill("SIGKILL");
		}
		await Promise.race([settled, delay(Math.min(shutdownTimeoutMs, 1_000))]);
		if (children.some(isRunning)) {
			throw new Error("Foreground child failed to exit after SIGKILL.");
		}

		if (first.kind === "signal") return exitCodeForSignal(first.result.signal);
		if (first.result.code !== null) return first.result.code;
		return exitCodeForSignal(first.result.signal);
	} finally {
		for (const [signal, handler] of handlers)
			signalSource.removeListener(signal, handler);
	}
}

export function spawnForegroundChild(spec: ChildSpec): ChildProcess {
	return spawn(spec.command, spec.args, {
		cwd: spec.cwd,
		env: spec.env ?? process.env,
		stdio: "inherit",
	});
}

export async function runForegroundChildren(
	specs: ChildSpec[],
	spawnChild: (spec: ChildSpec) => CoordinatedChild = spawnForegroundChild,
) {
	const children: CoordinatedChild[] = [];
	try {
		for (const spec of specs) children.push(spawnChild(spec));
	} catch (error) {
		if (children.length > 0) {
			const signalSource = new EventEmitter();
			const cleanup = coordinateChildren(children, { signalSource });
			signalSource.emit("SIGTERM");
			try {
				await cleanup;
			} catch (cleanupError) {
				throw new AggregateError(
					[error, cleanupError],
					"Foreground spawn failed and prior child cleanup also failed.",
				);
			}
		}
		throw error;
	}
	return coordinateChildren(children);
}
