import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import {
	lstat,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	readlink,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import ts from "typescript";
import { checkDevProfiles } from "./checkDevProfiles";
import {
	defaultManagedEnvFileSystem,
	writeManagedEnvFiles,
} from "./devProfile";
import { type DevStackDependencies, main } from "./devStack";
import {
	type CommandRunner,
	type LocalSupabaseStatus,
	resetLocalSupabase,
	startLocalSupabase,
} from "./localSupabase";
import {
	type CoordinatedChild,
	coordinateChildren,
	runForegroundChildren,
} from "./processCoordinator";

const expectedProjectId = "golden-years-server-next-local";
const expectedManagedMarker = "# golden-years-dev-profile:v1";
const repositoryServerRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);
const execFileAsync = promisify(execFile);

function expectedPaths(serverRoot: string) {
	return {
		localServerEnv: path.join(serverRoot, ".env.local.local"),
		remoteServerEnv: path.join(serverRoot, ".env.remote.local"),
		clientEnv: path.resolve(
			serverRoot,
			"../golden-years-client-next/.env.local",
		),
	};
}

type HarnessEvent =
	| { kind: "lifecycle"; name: string }
	| {
			kind: "foreground";
			specs: Array<{ command: string; args: string[]; cwd: string }>;
	  }
	| { kind: "log"; message: string };

interface HarnessEvidence {
	events: HarnessEvent[];
	serverEnv: string;
	clientEnv: string;
	exitCode: number;
	serverRoot: string;
	clientRoot: string;
}

interface HarnessOptions {
	silent?: boolean;
}

interface Sandbox {
	root: string;
	serverRoot: string;
	clientRoot: string;
}

const localStatus: LocalSupabaseStatus = {
	projectId: expectedProjectId,
	apiUrl: "http://127.0.0.1:54321",
	databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
	publishableKey: "local-publishable-sentinel",
	serviceRoleKey: "local-service-role-sentinel",
	mailpitUrl: "http://127.0.0.1:54324",
	studioUrl: "http://127.0.0.1:54323",
};

const remoteEnvironment = {
	GY_REMOTE_SUPABASE_URL: "https://harness-project.supabase.co",
	GY_REMOTE_SUPABASE_PUBLISHABLE_KEY: "remote-publishable-sentinel",
	GY_REMOTE_DATABASE_CONNECTION_STRING:
		"postgresql://postgres.harness:remote-password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
};

let assertionCount = 0;

function check(condition: unknown, message: string): asserts condition {
	assertionCount += 1;
	if (!condition) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, message: string) {
	check(
		JSON.stringify(actual) === JSON.stringify(expected),
		`${message}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`,
	);
}

async function expectReject(
	operation: () => Promise<unknown>,
	pattern: RegExp,
	message: string,
) {
	assertionCount += 1;
	try {
		await operation();
	} catch (error) {
		const text = error instanceof Error ? error.message : String(error);
		if (pattern.test(text)) return;
		throw new Error(`${message}: rejected with unexpected error: ${text}`);
	}
	throw new Error(`${message}: operation unexpectedly succeeded.`);
}

async function withRemoteEnvironment<T>(
	operation: () => Promise<T>,
): Promise<T> {
	const previous = Object.fromEntries(
		Object.keys(remoteEnvironment).map((key) => [key, process.env[key]]),
	);
	Object.assign(process.env, remoteEnvironment);
	try {
		return await operation();
	} finally {
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
}

async function createSandbox(): Promise<Sandbox> {
	const root = await mkdtemp(
		path.join(tmpdir(), "gy-dev-orchestration-harness-"),
	);
	const serverRoot = path.join(root, "golden-years-server-next");
	const clientRoot = path.join(root, "golden-years-client-next");
	await mkdir(path.join(serverRoot, "tools/dev"), { recursive: true });
	await mkdir(clientRoot, { recursive: true });
	await writeFile(
		path.join(serverRoot, "package.json"),
		JSON.stringify({ devDependencies: { supabase: "2.109.0" } }),
		"utf8",
	);
	await writeFile(
		path.join(serverRoot, "tools/dev/dev-profiles.example.json"),
		JSON.stringify({
			version: 1,
			profiles: {
				local: {
					kind: "local",
					wranglerEnv: "local",
					browserOrigin: "http://localhost:5173",
					apiOrigin: "http://127.0.0.1:8787",
				},
				remote: {
					kind: "remote",
					wranglerEnv: "remote",
					browserOrigin: "http://localhost:5173",
					apiOrigin: "http://127.0.0.1:8787",
					supabaseUrl: `\${GY_REMOTE_SUPABASE_URL}`,
					supabasePublishableKey: `\${GY_REMOTE_SUPABASE_PUBLISHABLE_KEY}`,
					databaseConnectionString: `\${GY_REMOTE_DATABASE_CONNECTION_STRING}`,
				},
			},
		}),
		"utf8",
	);
	return { root, serverRoot, clientRoot };
}

function createDependencies(
	sandbox: Sandbox,
	events: HarnessEvent[],
	foregroundExitCode = 23,
): DevStackDependencies {
	return {
		serverRoot: sandbox.serverRoot,
		clientRoot: sandbox.clientRoot,
		log(message) {
			events.push({ kind: "log", message });
		},
		async preflightLocalSupabase() {
			events.push({ kind: "lifecycle", name: "preflight" });
		},
		async readLocalSupabaseStatus() {
			events.push({ kind: "lifecycle", name: "status" });
			return localStatus;
		},
		async startLocalSupabase() {
			events.push({ kind: "lifecycle", name: "start" });
			return localStatus;
		},
		async stopLocalSupabase() {
			events.push({ kind: "lifecycle", name: "stop" });
		},
		async resetLocalSupabase() {
			events.push({ kind: "lifecycle", name: "reset" });
			return localStatus;
		},
		async seedLocalDatabase() {
			events.push({ kind: "lifecycle", name: "seed" });
		},
		async runForegroundChildren(specs) {
			events.push({
				kind: "foreground",
				specs: specs.map(({ command, args, cwd }) => ({ command, args, cwd })),
			});
			return foregroundExitCode;
		},
	};
}

function lifecycleNames(events: HarnessEvent[]) {
	return events
		.filter(
			(event): event is Extract<HarnessEvent, { kind: "lifecycle" }> =>
				event.kind === "lifecycle",
		)
		.map((event) => event.name);
}

function foreground(events: HarnessEvent[]) {
	return events.find(
		(event): event is Extract<HarnessEvent, { kind: "foreground" }> =>
			event.kind === "foreground",
	);
}

function logs(events: HarnessEvent[]) {
	return events
		.filter(
			(event): event is Extract<HarnessEvent, { kind: "log" }> =>
				event.kind === "log",
		)
		.map((event) => event.message)
		.join("\n");
}

function parseManagedEnv(source: string, label: string) {
	const lines = source.trimEnd().split(/\r?\n/);
	check(
		lines[0] === expectedManagedMarker,
		`${label} must start with the exact managed marker.`,
	);
	const values: Record<string, string> = {};
	for (const line of lines.slice(1)) {
		if (!line || line.startsWith("#")) continue;
		const separator = line.indexOf("=");
		check(separator > 0, `${label} contains a malformed assignment.`);
		const key = line.slice(0, separator);
		check(!(key in values), `${label} contains duplicate key ${key}.`);
		values[key] = line.slice(separator + 1);
	}
	return values;
}

function expectedForegroundSpecs(
	evidence: HarnessEvidence,
	kind: "local" | "remote",
) {
	return [
		{
			command: "pnpm",
			args: [
				"exec",
				"wrangler",
				"dev",
				"--env",
				kind,
				"--ip",
				"127.0.0.1",
				"--port",
				"8787",
			],
			cwd: evidence.serverRoot,
		},
		{
			command: "pnpm",
			args: [
				"exec",
				"vite",
				"--host",
				"localhost",
				"--port",
				"5173",
				"--strictPort",
			],
			cwd: evidence.clientRoot,
		},
	];
}

function validateRemoteEvidence(evidence: HarnessEvidence) {
	check(
		evidence.exitCode === 23,
		"Remote start must propagate the foreground exit code.",
	);
	check(
		lifecycleNames(evidence.events).length === 0,
		"Remote start must not invoke any local lifecycle boundary.",
	);
	const children = foreground(evidence.events);
	check(
		children?.specs.length === 2,
		"Remote start must launch exactly Wrangler and Vite.",
	);
	equal(
		children.specs,
		expectedForegroundSpecs(evidence, "remote"),
		"Remote child commands, argv, order, and cwd must match exactly.",
	);
	equal(
		parseManagedEnv(evidence.serverEnv, "remote server env"),
		{
			CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
				remoteEnvironment.GY_REMOTE_DATABASE_CONNECTION_STRING,
			CORS_ORIGIN: "http://localhost:5173",
			SUPABASE_AUTH_REDIRECT_URL: "http://localhost:5173/login",
			SUPABASE_PUBLISHABLE_KEY:
				remoteEnvironment.GY_REMOTE_SUPABASE_PUBLISHABLE_KEY,
			SUPABASE_URL: remoteEnvironment.GY_REMOTE_SUPABASE_URL,
		},
		"Remote server env must have the exact managed key/value contract.",
	);
	equal(
		parseManagedEnv(evidence.clientEnv, "remote client env"),
		{
			VITE_API_BASE_URL: "http://127.0.0.1:8787/api/v1",
			VITE_USE_MOCK_API: "false",
		},
		"Remote client env must contain only Golden Years API configuration.",
	);
	const output = logs(evidence.events);
	check(
		/REMOTE: hosted Supabase data is persistent/.test(output),
		"Remote warning must be logged.",
	);
	check(
		!output.includes(remoteEnvironment.GY_REMOTE_SUPABASE_PUBLISHABLE_KEY) &&
			!output.includes(remoteEnvironment.GY_REMOTE_DATABASE_CONNECTION_STRING),
		"Remote logs must not expose credentials or connection strings.",
	);
	const warningIndex = evidence.events.findIndex(
		(event) => event.kind === "log" && event.message.startsWith("REMOTE:"),
	);
	const foregroundIndex = evidence.events.findIndex(
		(event) => event.kind === "foreground",
	);
	check(
		warningIndex >= 0 && warningIndex < foregroundIndex,
		"Remote persistent-data warning must precede foreground launch.",
	);
}

function validateLocalEvidence(evidence: HarnessEvidence) {
	check(
		evidence.exitCode === 23,
		"Local start must propagate the foreground exit code.",
	);
	equal(
		lifecycleNames(evidence.events),
		["start"],
		"Local start must use its local lifecycle boundary once.",
	);
	const children = foreground(evidence.events);
	check(
		children?.specs.length === 2,
		"Local start must launch exactly Wrangler and Vite.",
	);
	equal(
		children.specs,
		expectedForegroundSpecs(evidence, "local"),
		"Local child commands, argv, order, and cwd must match exactly.",
	);
	equal(
		parseManagedEnv(evidence.serverEnv, "local server env"),
		{
			CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
				localStatus.databaseUrl,
			CORS_ORIGIN: "http://localhost:5173",
			SUPABASE_AUTH_REDIRECT_URL: "http://localhost:5173/login",
			SUPABASE_PUBLISHABLE_KEY: localStatus.publishableKey,
			SUPABASE_URL: localStatus.apiUrl,
		},
		"Local server env must have the exact discovered loopback contract.",
	);
	equal(
		parseManagedEnv(evidence.clientEnv, "local client env"),
		{
			VITE_API_BASE_URL: "http://127.0.0.1:8787/api/v1",
			VITE_USE_MOCK_API: "false",
		},
		"Local client env must contain only Golden Years API configuration.",
	);
	check(
		!/supabase\.co|pooler\.supabase\.com/i.test(
			`${evidence.serverEnv}\n${evidence.clientEnv}\n${logs(evidence.events)}`,
		),
		"Local evidence must not contain a hosted Supabase hostname.",
	);
	const output = logs(evidence.events);
	for (const secret of [
		localStatus.publishableKey,
		localStatus.serviceRoleKey,
		localStatus.databaseUrl,
	]) {
		check(
			!evidence.clientEnv.includes(secret ?? "") &&
				!output.includes(secret ?? ""),
			"Local client env and logs must not expose provider or DB credentials.",
		);
	}
}

async function readEvidence(
	sandbox: Sandbox,
	kind: "local" | "remote",
	events: HarnessEvent[],
	exitCode: number,
): Promise<HarnessEvidence> {
	const paths = expectedPaths(sandbox.serverRoot);
	return {
		events,
		exitCode,
		serverRoot: sandbox.serverRoot,
		clientRoot: sandbox.clientRoot,
		serverEnv: await readFile(
			kind === "local" ? paths.localServerEnv : paths.remoteServerEnv,
			"utf8",
		),
		clientEnv: await readFile(paths.clientEnv, "utf8"),
	};
}

async function scenarioRemoteAndLocalDifferential(sandbox: Sandbox) {
	const localEvents: HarnessEvent[] = [];
	const localExit = await main(
		["start", "local"],
		createDependencies(sandbox, localEvents),
	);
	const localEvidence = await readEvidence(
		sandbox,
		"local",
		localEvents,
		localExit,
	);
	validateLocalEvidence(localEvidence);
	const localClient = localEvidence.clientEnv;

	const remoteEvents: HarnessEvent[] = [];
	const remoteExit = await withRemoteEnvironment(() =>
		main(["start", "remote"], createDependencies(sandbox, remoteEvents)),
	);
	const remoteEvidence = await readEvidence(
		sandbox,
		"remote",
		remoteEvents,
		remoteExit,
	);
	validateRemoteEvidence(remoteEvidence);
	check(
		remoteEvidence.clientEnv === localClient,
		"Switching local to remote must keep the provider-free client env byte-identical.",
	);
	const paths = expectedPaths(sandbox.serverRoot);
	const preservedLocal = await readFile(paths.localServerEnv, "utf8");
	check(
		preservedLocal === localEvidence.serverEnv,
		"Remote start must not overwrite the local server env file.",
	);

	const secondLocalEvents: HarnessEvent[] = [];
	await main(
		["start", "local"],
		createDependencies(sandbox, secondLocalEvents),
	);
	const secondLocal = await readFile(paths.localServerEnv, "utf8");
	const preservedRemote = await readFile(paths.remoteServerEnv, "utf8");
	check(
		secondLocal === localEvidence.serverEnv,
		"Local → remote → local must be deterministic.",
	);
	check(
		preservedRemote === remoteEvidence.serverEnv,
		"Returning to local must preserve the separate remote server env file.",
	);

	return { localEvidence, remoteEvidence };
}

async function scenarioUnsafeOutputsHaveNoSideEffects() {
	for (const target of ["server", "client"] as const) {
		for (const hazard of ["unmanaged", "symlink"] as const) {
			const sandbox = await createSandbox();
			try {
				const paths = expectedPaths(sandbox.serverRoot);
				const filePath =
					target === "server" ? paths.localServerEnv : paths.clientEnv;
				await mkdir(path.dirname(filePath), { recursive: true });
				if (hazard === "unmanaged") {
					await writeFile(filePath, "operator-owned\n", "utf8");
				} else {
					const linkTarget = path.join(sandbox.root, `${target}-target`);
					await writeFile(linkTarget, "operator-owned\n", "utf8");
					await symlink(linkTarget, filePath);
				}
				const events: HarnessEvent[] = [];
				await expectReject(
					() => main(["start", "local"], createDependencies(sandbox, events)),
					/symlink|unmanaged/i,
					`${target} ${hazard} output must block local start`,
				);
				check(
					events.length === 0,
					`${target} ${hazard} output must block before lifecycle, logs, or foreground children.`,
				);
				const stat = await lstat(filePath);
				if (hazard === "symlink") {
					check(
						stat.isSymbolicLink(),
						"Blocked symlink must remain a symlink.",
					);
					check(
						Boolean(await readlink(filePath)),
						"Blocked symlink target must remain intact.",
					);
				} else {
					check(
						(await readFile(filePath, "utf8")) === "operator-owned\n",
						"Blocked unmanaged output must remain byte-identical.",
					);
				}
			} finally {
				await rm(sandbox.root, { recursive: true, force: true });
			}
		}
	}
}

async function scenarioSymlinkAncestorsHaveNoSideEffects() {
	for (const target of ["server", "client"] as const) {
		const sandbox = await createSandbox();
		try {
			let dependenciesRoot = sandbox.serverRoot;
			if (target === "server") {
				dependenciesRoot = path.join(sandbox.root, "server-root-link");
				await symlink(sandbox.serverRoot, dependenciesRoot);
			} else {
				const externalClient = path.join(sandbox.root, "external-client");
				await rm(sandbox.clientRoot, { recursive: true, force: true });
				await mkdir(externalClient);
				await symlink(externalClient, sandbox.clientRoot);
			}
			const events: HarnessEvent[] = [];
			const dependencies = createDependencies(
				{ ...sandbox, serverRoot: dependenciesRoot },
				events,
			);
			await expectReject(
				() => main(["start", "local"], dependencies),
				/symlink ancestor/i,
				`${target} symlink ancestor must block local start`,
			);
			check(
				events.length === 0,
				`${target} symlink ancestor must block before every side effect.`,
			);
		} finally {
			await rm(sandbox.root, { recursive: true, force: true });
		}
	}
}

async function scenarioTrackedWiringAndCapabilityBoundary() {
	await checkDevProfiles();
	const packageJson = JSON.parse(
		await readFile(path.join(repositoryServerRoot, "package.json"), "utf8"),
	) as { scripts?: Record<string, string> };
	const expectedScripts = {
		"check:dev-profiles": "node --import tsx tools/dev/checkDevProfiles.ts",
		"dev:profile:doctor": "node --import tsx tools/dev/devStack.ts doctor",
		"dev:profile:sync": "node --import tsx tools/dev/devStack.ts sync",
		"dev:seed:local": "node --import tsx tools/dev/devStack.ts seed-local",
		"dev:stack:local": "node --import tsx tools/dev/devStack.ts start local",
		"dev:stack:remote": "node --import tsx tools/dev/devStack.ts start remote",
		"dev:supabase:reset":
			"node --import tsx tools/dev/devStack.ts supabase reset",
		"dev:supabase:start":
			"node --import tsx tools/dev/devStack.ts supabase start",
		"dev:supabase:status":
			"node --import tsx tools/dev/devStack.ts supabase status",
		"dev:supabase:stop":
			"node --import tsx tools/dev/devStack.ts supabase stop",
		"db:migrate": "node --import tsx tools/db/migrate.ts",
		"seed:mockup":
			"node --import tsx tools/seed-import/importMockupFixtures.ts",
		"smoke:dev-stack:local": "node --import tsx tools/dev/smokeLocalStack.ts",
		"test:dev-orchestration-harness":
			"node --import tsx tools/dev/devOrchestrationHarness.ts",
	};
	equal(
		Object.fromEntries(
			Object.keys(expectedScripts).map((name) => [
				name,
				packageJson.scripts?.[name],
			]),
		),
		expectedScripts,
		"Every tracked orchestration script must invoke its real entrypoint exactly.",
	);
	const source = await readFile(
		path.join(repositoryServerRoot, "tools/dev/devStack.ts"),
		"utf8",
	);
	const sourceFile = ts.createSourceFile(
		"devStack.ts",
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const actualImports = new Map<string, string[]>();
	for (const statement of sourceFile.statements) {
		if (
			!ts.isImportDeclaration(statement) ||
			!ts.isStringLiteral(statement.moduleSpecifier)
		)
			continue;
		const names: string[] = [];
		if (statement.importClause?.name)
			names.push(`default:${statement.importClause.name.text}`);
		const bindings = statement.importClause?.namedBindings;
		if (bindings && ts.isNamedImports(bindings)) {
			for (const element of bindings.elements) names.push(element.name.text);
		}
		actualImports.set(statement.moduleSpecifier.text, names.sort());
	}
	const expectedImports = new Map<string, string[]>([
		["node:fs/promises", ["readFile"]],
		["node:path", ["default:path"]],
		["node:url", ["fileURLToPath", "pathToFileURL"]],
		[
			"./devProfile",
			[
				"DerivedDevProfile",
				"ProfileKind",
				"deriveDevProfile",
				"getTrustedProfilePaths",
				"loadDevProfile",
				"preflightManagedEnvFiles",
				"redactSensitiveText",
				"renderClientEnv",
				"renderServerEnv",
				"writeManagedEnvFiles",
			].sort(),
		],
		[
			"./localSupabase",
			[
				"LocalSupabaseStatus",
				"preflightLocalSupabase",
				"readLocalSupabaseStatus",
				"resetLocalSupabase",
				"seedLocalDatabase",
				"startLocalSupabase",
				"stopLocalSupabase",
			].sort(),
		],
		["./processCoordinator", ["ChildSpec", "runForegroundChildren"].sort()],
	]);
	equal(
		Object.fromEntries([...actualImports.entries()].sort()),
		Object.fromEntries([...expectedImports.entries()].sort()),
		"devStack imports must stay on the reviewed capability allowlist.",
	);
	const doctor = await execFileAsync(
		process.execPath,
		["--import", "tsx", "tools/dev/devStack.ts", "doctor", "local"],
		{ cwd: repositoryServerRoot, env: process.env },
	);
	check(
		doctor.stdout.includes("local profile is valid."),
		"The actual CLI bootstrap must forward argv and execute local doctor.",
	);
	const secretSentinel = "must-not-appear-in-cli-error";
	let invalidCode: number | string | undefined;
	let invalidStderr = "";
	try {
		await execFileAsync(
			process.execPath,
			["--import", "tsx", "tools/dev/devStack.ts", "doctor", "remote"],
			{
				cwd: repositoryServerRoot,
				env: {
					...process.env,
					GY_REMOTE_SUPABASE_URL: "https://harness-project.supabase.co",
					GY_REMOTE_SUPABASE_PUBLISHABLE_KEY: secretSentinel,
					GY_REMOTE_DATABASE_CONNECTION_STRING: `postgresql://postgres.harness:${secretSentinel}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
				},
			},
		);
	} catch (error) {
		const failure = error as Error & {
			code?: number | string;
			stderr?: string;
		};
		invalidCode = failure.code;
		invalidStderr = failure.stderr ?? failure.message;
	}
	check(
		invalidCode === 1,
		"Invalid real CLI invocation must propagate exit code 1.",
	);
	check(
		!invalidStderr.includes(secretSentinel),
		"The actual CLI error boundary must redact sentinel credentials.",
	);
}

async function scenarioRemoteInvalidInputHasNoSideEffects() {
	const sandbox = await createSandbox();
	try {
		const events: HarnessEvent[] = [];
		await withRemoteEnvironment(async () => {
			const previous = process.env.GY_REMOTE_DATABASE_CONNECTION_STRING;
			process.env.GY_REMOTE_DATABASE_CONNECTION_STRING = previous?.replace(
				":5432/",
				":6543/",
			);
			try {
				await expectReject(
					() => main(["start", "remote"], createDependencies(sandbox, events)),
					/5432/,
					"Transaction-pooler remote input must fail",
				);
			} finally {
				process.env.GY_REMOTE_DATABASE_CONNECTION_STRING = previous;
			}
		});
		check(
			events.length === 0,
			"Invalid remote input must not log or launch children.",
		);
		const paths = expectedPaths(sandbox.serverRoot);
		await expectReject(
			() => readFile(paths.remoteServerEnv),
			/ENOENT/,
			"Invalid remote input must not write its server env",
		);
		await expectReject(
			() => readFile(paths.clientEnv),
			/ENOENT/,
			"Invalid remote input must not write the client env",
		);
	} finally {
		await rm(sandbox.root, { recursive: true, force: true });
	}
}

async function scenarioLocalLifecycleLedger() {
	const sandbox = await createSandbox();
	try {
		await mkdir(path.join(sandbox.serverRoot, "supabase"), { recursive: true });
		await writeFile(
			path.join(sandbox.serverRoot, "supabase/config.toml"),
			`project_id = "${expectedProjectId}"\n`,
			"utf8",
		);
		type CommandEntry = {
			command: string;
			args: string[];
			cwd: string;
			databaseUrl?: string;
		};
		const commands: CommandEntry[] = [];
		const runner: CommandRunner = async (command, args, options) => {
			commands.push({
				command,
				args: [...args],
				cwd: options.cwd,
				databaseUrl: options.env?.DATABASE_URL,
			});
			return {
				exitCode: 0,
				stdout: args.includes("status")
					? JSON.stringify({
							API_URL: localStatus.apiUrl,
							DB_URL: localStatus.databaseUrl,
							PUBLISHABLE_KEY: localStatus.publishableKey,
							SECRET_KEY: localStatus.serviceRoleKey,
							INBUCKET_URL: localStatus.mailpitUrl,
							STUDIO_URL: localStatus.studioUrl,
						})
					: "",
				stderr: "",
			};
		};

		await startLocalSupabase(sandbox.serverRoot, runner);
		equal(
			commands.map(({ command, args }) => [command, ...args]),
			[
				["docker", "info"],
				["pnpm", "exec", "supabase", "start"],
				["pnpm", "exec", "supabase", "status", "--output", "json"],
				["pnpm", "db:migrate"],
				["pnpm", "seed:mockup"],
			],
			"Local start command order must preflight, start, discover, migrate, then seed.",
		);
		for (const entry of commands) {
			check(
				entry.cwd === sandbox.serverRoot,
				"Every local command must use the trusted server cwd.",
			);
			check(
				!entry.args.some((arg) => arg.includes("postgresql://")),
				"Database URLs must never be passed in local command arguments.",
			);
			if (entry.args[0] === "db:migrate" || entry.args[0] === "seed:mockup") {
				check(
					entry.databaseUrl === localStatus.databaseUrl,
					"Migration and seed must receive the discovered local DB URL via environment.",
				);
			}
		}

		commands.length = 0;
		await resetLocalSupabase(sandbox.serverRoot, runner);
		const resetArgv = commands.map(({ command, args }) => [command, ...args]);
		check(
			resetArgv.some(
				(argv) =>
					argv.join(" ") ===
					`pnpm exec supabase stop --project-id ${expectedProjectId} --no-backup`,
			),
			"Reset must delete only the committed local project's data.",
		);
		check(
			!resetArgv.flat().includes("--all"),
			"No local lifecycle command may use Supabase --all.",
		);
		check(
			resetArgv.at(-2)?.join(" ") === "pnpm db:migrate" &&
				resetArgv.at(-1)?.join(" ") === "pnpm seed:mockup",
			"Reset must finish by migrating and reseeding.",
		);
	} finally {
		await rm(sandbox.root, { recursive: true, force: true });
	}
}

async function scenarioPoisonedLocalStatusRejected() {
	const poisoners: Array<
		[string, (status: LocalSupabaseStatus) => LocalSupabaseStatus]
	> = [
		[
			"hosted API",
			(status) => ({ ...status, apiUrl: "https://evil.supabase.co" }),
		],
		[
			"hosted database",
			(status) => ({
				...status,
				databaseUrl:
					"postgresql://postgres:password@db.evil.supabase.co:5432/postgres",
			}),
		],
		[
			"wrong Mailpit port",
			(status) => ({ ...status, mailpitUrl: "http://127.0.0.1:9999" }),
		],
		[
			"wrong Studio port",
			(status) => ({ ...status, studioUrl: "http://127.0.0.1:9998" }),
		],
	];

	for (const [label, poison] of poisoners) {
		const sandbox = await createSandbox();
		try {
			await mkdir(path.join(sandbox.serverRoot, "supabase"), {
				recursive: true,
			});
			await writeFile(
				path.join(sandbox.serverRoot, "supabase/config.toml"),
				`project_id = "${expectedProjectId}"\n`,
				"utf8",
			);
			const poisoned = poison(localStatus);
			const commands: string[] = [];
			const runner: CommandRunner = async (command, args) => {
				commands.push([command, ...args].join(" "));
				return {
					exitCode: 0,
					stdout: args.includes("status")
						? JSON.stringify({
								API_URL: poisoned.apiUrl,
								DB_URL: poisoned.databaseUrl,
								PUBLISHABLE_KEY: poisoned.publishableKey,
								INBUCKET_URL: poisoned.mailpitUrl,
								STUDIO_URL: poisoned.studioUrl,
							})
						: "",
					stderr: "",
				};
			};
			await expectReject(
				() => startLocalSupabase(sandbox.serverRoot, runner),
				/loopback|port/i,
				`${label} status must be rejected`,
			);
			check(
				!commands.includes("pnpm db:migrate") &&
					!commands.includes("pnpm seed:mockup"),
				`${label} status must fail before migration and seed.`,
			);
		} finally {
			await rm(sandbox.root, { recursive: true, force: true });
		}
	}
}

async function scenarioLocalLifecycleFailureOrdering() {
	for (const failure of [
		"docker info",
		"supabase start",
		"supabase status",
		"db:migrate",
	] as const) {
		const sandbox = await createSandbox();
		try {
			await mkdir(path.join(sandbox.serverRoot, "supabase"), {
				recursive: true,
			});
			await writeFile(
				path.join(sandbox.serverRoot, "supabase/config.toml"),
				`project_id = "${expectedProjectId}"\n`,
				"utf8",
			);
			const commands: string[] = [];
			const runner: CommandRunner = async (command, args) => {
				const label =
					command === "docker"
						? "docker info"
						: args.includes("start")
							? "supabase start"
							: args.includes("status")
								? "supabase status"
								: (args[0] ?? "unknown");
				commands.push(label);
				return {
					exitCode: label === failure ? 41 : 0,
					stdout:
						label === "supabase status"
							? JSON.stringify({
									API_URL: localStatus.apiUrl,
									DB_URL: localStatus.databaseUrl,
									PUBLISHABLE_KEY: localStatus.publishableKey,
									INBUCKET_URL: localStatus.mailpitUrl,
								})
							: "",
					stderr: `failure ${localStatus.databaseUrl} ${localStatus.publishableKey}`,
				};
			};
			let errorText = "";
			try {
				await startLocalSupabase(sandbox.serverRoot, runner);
			} catch (error) {
				errorText = error instanceof Error ? error.message : String(error);
			}
			check(Boolean(errorText), `${failure} failure must reject local start.`);
			check(
				!errorText.includes(localStatus.databaseUrl) &&
					!errorText.includes(localStatus.publishableKey),
				`${failure} failure must not leak captured credentials.`,
			);
			const failureIndex = commands.indexOf(failure);
			check(failureIndex >= 0, `${failure} injection must be reached.`);
			check(
				commands.length === failureIndex + 1,
				`${failure} must prevent every later lifecycle command.`,
			);
			check(
				!commands.includes("seed:mockup"),
				`${failure} must prevent seed execution.`,
			);
		} finally {
			await rm(sandbox.root, { recursive: true, force: true });
		}
	}
}

async function scenarioForceBackup() {
	const sandbox = await createSandbox();
	try {
		const paths = expectedPaths(sandbox.serverRoot);
		await mkdir(path.dirname(paths.remoteServerEnv), { recursive: true });
		await writeFile(paths.remoteServerEnv, "operator-server\n", {
			mode: 0o644,
		});
		await writeFile(paths.clientEnv, "operator-client\n", { mode: 0o644 });
		const events: HarnessEvent[] = [];
		await withRemoteEnvironment(() =>
			main(["start", "remote", "--force"], createDependencies(sandbox, events)),
		);
		const serverBackups = (
			await readdir(path.dirname(paths.remoteServerEnv))
		).filter((name) =>
			name.startsWith(`${path.basename(paths.remoteServerEnv)}.bak.`),
		);
		const clientBackups = (await readdir(path.dirname(paths.clientEnv))).filter(
			(name) => name.startsWith(`${path.basename(paths.clientEnv)}.bak.`),
		);
		check(serverBackups.length === 1, "Force must create one server backup.");
		check(clientBackups.length === 1, "Force must create one client backup.");
		check(
			(await readFile(
				path.join(path.dirname(paths.remoteServerEnv), serverBackups[0]),
				"utf8",
			)) === "operator-server\n",
			"Server backup must preserve exact operator bytes.",
		);
		check(
			(await readFile(
				path.join(path.dirname(paths.clientEnv), clientBackups[0]),
				"utf8",
			)) === "operator-client\n",
			"Client backup must preserve exact operator bytes.",
		);
		for (const filePath of [paths.remoteServerEnv, paths.clientEnv]) {
			const mode = (await lstat(filePath)).mode & 0o777;
			check(mode === 0o600, "Managed env outputs must have mode 0600.");
			check(
				(await readFile(filePath, "utf8")).startsWith(expectedManagedMarker),
				"Force replacement must produce an exactly marked managed file.",
			);
		}
	} finally {
		await rm(sandbox.root, { recursive: true, force: true });
	}
}

async function scenarioWriteRollbackOnCommitFailure() {
	const sandbox = await createSandbox();
	try {
		const paths = expectedPaths(sandbox.serverRoot);
		const oldServer = `${expectedManagedMarker}\nOLD_SERVER=one\n`;
		const oldClient = `${expectedManagedMarker}\nOLD_CLIENT=two\n`;
		await writeFile(paths.localServerEnv, oldServer, { mode: 0o640 });
		await writeFile(paths.clientEnv, oldClient, { mode: 0o600 });
		let renameCount = 0;
		const fileSystem = {
			...defaultManagedEnvFileSystem,
			async rename(
				oldPath: Parameters<typeof defaultManagedEnvFileSystem.rename>[0],
				newPath: Parameters<typeof defaultManagedEnvFileSystem.rename>[1],
			) {
				renameCount += 1;
				if (renameCount === 2)
					throw new Error("injected second rename failure");
				await defaultManagedEnvFileSystem.rename(oldPath, newPath);
			},
		};
		await expectReject(
			() =>
				writeManagedEnvFiles({
					serverPath: paths.localServerEnv,
					clientPath: paths.clientEnv,
					serverRoot: sandbox.serverRoot,
					clientRoot: sandbox.clientRoot,
					serverContent: `${expectedManagedMarker}\nNEW_SERVER=three\n`,
					clientContent: `${expectedManagedMarker}\nNEW_CLIENT=four\n`,
					fileSystem,
				}),
			/injected second rename failure/,
			"Second-output commit failure must reject the managed write",
		);
		check(
			(await readFile(paths.localServerEnv, "utf8")) === oldServer,
			"Commit failure must restore the original server env bytes.",
		);
		check(
			(await readFile(paths.clientEnv, "utf8")) === oldClient,
			"Commit failure must preserve the original client env bytes.",
		);
		check(
			((await lstat(paths.localServerEnv)).mode & 0o777) === 0o640,
			"Commit failure must restore the original server env mode.",
		);
		check(
			((await lstat(paths.clientEnv)).mode & 0o777) === 0o600,
			"Commit failure must preserve the original client env mode.",
		);
		const debris = [
			...(await readdir(path.dirname(paths.localServerEnv))),
			...(await readdir(path.dirname(paths.clientEnv))),
		].filter((name) => name.endsWith(".tmp"));
		check(
			debris.length === 0,
			"Commit failure must remove every temporary file.",
		);
	} finally {
		await rm(sandbox.root, { recursive: true, force: true });
	}
}

async function scenarioAbsentOutputRollbackOnTempFailure() {
	const sandbox = await createSandbox();
	try {
		const paths = expectedPaths(sandbox.serverRoot);
		let tempWriteCount = 0;
		const fileSystem = {
			...defaultManagedEnvFileSystem,
			async writeFile(
				file: Parameters<typeof defaultManagedEnvFileSystem.writeFile>[0],
				data: Parameters<typeof defaultManagedEnvFileSystem.writeFile>[1],
				options?: Parameters<typeof defaultManagedEnvFileSystem.writeFile>[2],
			) {
				if (String(file).endsWith(".tmp")) tempWriteCount += 1;
				if (tempWriteCount === 2)
					throw new Error("injected second temp-write failure");
				await defaultManagedEnvFileSystem.writeFile(file, data, options);
			},
		};
		await expectReject(
			() =>
				writeManagedEnvFiles({
					serverPath: paths.localServerEnv,
					clientPath: paths.clientEnv,
					serverRoot: sandbox.serverRoot,
					clientRoot: sandbox.clientRoot,
					serverContent: `${expectedManagedMarker}\nSERVER=one\n`,
					clientContent: `${expectedManagedMarker}\nCLIENT=two\n`,
					fileSystem,
				}),
			/injected second temp-write failure/,
			"Second temp-write failure must reject when both outputs were absent",
		);
		for (const filePath of [paths.localServerEnv, paths.clientEnv]) {
			await expectReject(
				() => lstat(filePath),
				/ENOENT/,
				"Failed creation must leave originally absent outputs absent",
			);
		}
		const debris = [
			...(await readdir(path.dirname(paths.localServerEnv))),
			...(await readdir(path.dirname(paths.clientEnv))),
		].filter((name) => name.endsWith(".tmp"));
		check(
			debris.length === 0,
			"Temp-write failure must remove all temp debris.",
		);
	} finally {
		await rm(sandbox.root, { recursive: true, force: true });
	}
}

class HarnessChild extends EventEmitter implements CoordinatedChild {
	exitCode: number | null = null;
	signalCode: NodeJS.Signals | null = null;
	kills: NodeJS.Signals[] = [];

	kill(signal: NodeJS.Signals = "SIGTERM") {
		this.kills.push(signal);
		this.signalCode = signal;
		queueMicrotask(() => this.emit("exit", null, signal));
		return true;
	}

	exit(code: number) {
		this.exitCode = code;
		this.emit("exit", code, null);
	}
}

class StubbornHarnessChild extends HarnessChild {
	override kill(signal: NodeJS.Signals = "SIGTERM") {
		this.kills.push(signal);
		return true;
	}
}

async function scenarioProcessCoordinator() {
	const first = new HarnessChild();
	const second = new HarnessChild();
	const result = coordinateChildren([first, second], { shutdownTimeoutMs: 20 });
	first.exit(17);
	check(
		(await result) === 17,
		"Coordinator must propagate the first child's nonzero exit.",
	);
	equal(
		second.kills,
		["SIGTERM"],
		"Coordinator must terminate the sibling exactly once.",
	);

	for (const [signal, expectedCode] of [
		["SIGHUP", 129],
		["SIGINT", 130],
		["SIGTERM", 143],
	] as const) {
		const signalSource = new EventEmitter();
		const left = new HarnessChild();
		const right = new HarnessChild();
		const signalled = coordinateChildren([left, right], {
			signalSource,
			shutdownTimeoutMs: 20,
		});
		signalSource.emit(signal);
		check(
			(await signalled) === expectedCode,
			`Coordinator must map ${signal} to exit code ${expectedCode}.`,
		);
		equal(
			left.kills,
			[signal],
			`Coordinator must forward ${signal} to child one.`,
		);
		equal(
			right.kills,
			[signal],
			`Coordinator must forward ${signal} to child two.`,
		);
		for (const registered of ["SIGHUP", "SIGINT", "SIGTERM"] as const) {
			check(
				signalSource.listenerCount(registered) === 0,
				`Coordinator must remove ${registered} listeners after ${signal}.`,
			);
		}
	}

	const exiting = new HarnessChild();
	const stubborn = new StubbornHarnessChild();
	const stubbornResult = coordinateChildren([exiting, stubborn], {
		shutdownTimeoutMs: 5,
	});
	exiting.exit(9);
	await expectReject(
		() => stubbornResult,
		/failed to exit after SIGKILL/i,
		"Coordinator must not report success while a child remains alive",
	);
	equal(
		stubborn.kills,
		["SIGTERM", "SIGKILL"],
		"Coordinator must escalate a stubborn child from SIGTERM to SIGKILL.",
	);

	const partiallySpawned = new HarnessChild();
	let spawnCount = 0;
	await expectReject(
		() =>
			runForegroundChildren(
				[
					{ command: "first", args: [], cwd: "/tmp" },
					{ command: "second", args: [], cwd: "/tmp" },
				],
				() => {
					spawnCount += 1;
					if (spawnCount === 2)
						throw new Error("injected second spawn failure");
					return partiallySpawned;
				},
			),
		/injected second spawn failure/,
		"Second child spawn failure must reject foreground startup",
	);
	equal(
		partiallySpawned.kills,
		["SIGTERM"],
		"Second child spawn failure must terminate the already-started child.",
	);
}

async function scenarioMutationSelfChecks(
	localEvidence: HarnessEvidence,
	remoteEvidence: HarnessEvidence,
) {
	const remoteLifecycleMutant: HarnessEvidence = {
		...remoteEvidence,
		events: [...remoteEvidence.events, { kind: "lifecycle", name: "seed" }],
	};
	await expectReject(
		async () => validateRemoteEvidence(remoteLifecycleMutant),
		/local lifecycle/i,
		"Harness must catch a remote-seed mutant",
	);
	await expectReject(
		async () =>
			validateRemoteEvidence({
				...remoteEvidence,
				clientEnv: `${remoteEvidence.clientEnv}SUPABASE_URL=https://evil.supabase.co\n`,
			}),
		/client env|provider|database/i,
		"Harness must catch a frontend-secret mutant",
	);
	await expectReject(
		async () =>
			validateLocalEvidence({
				...localEvidence,
				serverEnv: localEvidence.serverEnv.replace(
					localStatus.apiUrl,
					"https://evil.supabase.co",
				),
			}),
		/loopback|hosted/i,
		"Harness must catch a hosted-local-status mutant",
	);
	await expectReject(
		async () => validateRemoteEvidence({ ...remoteEvidence, exitCode: 0 }),
		/exit code/i,
		"Harness must catch an always-zero exit mutant",
	);
	return [
		"remote lifecycle invocation",
		"frontend provider secret",
		"hosted local status",
		"swallowed foreground exit",
	];
}

export async function runDevOrchestrationHarness(options: HarnessOptions = {}) {
	assertionCount = 0;
	const completed: string[] = [];
	let mutantsCaught: string[] = [];
	const run = async (name: string, scenario: () => Promise<void>) => {
		await scenario();
		completed.push(name);
		if (!options.silent) console.log(`PASS ${name}`);
	};

	const differentialSandbox = await createSandbox();
	let differentialEvidence:
		| { localEvidence: HarnessEvidence; remoteEvidence: HarnessEvidence }
		| undefined;
	try {
		await run("local/remote/local differential", async () => {
			differentialEvidence =
				await scenarioRemoteAndLocalDifferential(differentialSandbox);
		});
	} finally {
		await rm(differentialSandbox.root, { recursive: true, force: true });
	}

	await run(
		"unsafe outputs have zero side effects",
		scenarioUnsafeOutputsHaveNoSideEffects,
	);
	await run(
		"symlink ancestors have zero side effects",
		scenarioSymlinkAncestorsHaveNoSideEffects,
	);
	await run(
		"invalid remote input has zero side effects",
		scenarioRemoteInvalidInputHasNoSideEffects,
	);
	await run(
		"tracked wiring and capability boundary",
		scenarioTrackedWiringAndCapabilityBoundary,
	);
	await run("local lifecycle command ledger", scenarioLocalLifecycleLedger);
	await run(
		"poisoned local status rejection",
		scenarioPoisonedLocalStatusRejected,
	);
	await run(
		"local lifecycle failure ordering",
		scenarioLocalLifecycleFailureOrdering,
	);
	await run("force backup and permissions", scenarioForceBackup);
	await run(
		"write rollback on commit failure",
		scenarioWriteRollbackOnCommitFailure,
	);
	await run(
		"absent output rollback on temp failure",
		scenarioAbsentOutputRollbackOnTempFailure,
	);
	await run("foreground process coordination", scenarioProcessCoordinator);
	await run("mutation self-checks", async () => {
		if (!differentialEvidence) {
			throw new Error(
				"Differential evidence must exist before mutation checks.",
			);
		}
		mutantsCaught = await scenarioMutationSelfChecks(
			differentialEvidence.localEvidence,
			differentialEvidence.remoteEvidence,
		);
	});

	check(
		completed.length === 13,
		"Harness must execute every declared scenario.",
	);
	check(
		assertionCount >= 130,
		"Harness assertion floor was not reached; checks may have been bypassed.",
	);
	if (!options.silent) {
		console.log(
			`PASS ${completed.length} scenarios with ${assertionCount} assertions.`,
		);
	}
	return {
		completed: [...completed],
		assertions: assertionCount,
		mutantsCaught,
	};
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	await runDevOrchestrationHarness();
}
