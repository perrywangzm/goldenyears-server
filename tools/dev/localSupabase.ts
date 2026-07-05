import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LocalSupabaseCredentials } from "./devProfile";

export const localSupabaseProjectId = "golden-years-server-next-local";
export const localSupabasePorts = {
	api: 54321,
	database: 54322,
	studio: 54323,
	mailpit: 54324,
} as const;

export interface LocalSupabaseStatus extends LocalSupabaseCredentials {
	projectId: string;
}

export interface CommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

export interface RunCommandOptions {
	cwd: string;
	env?: NodeJS.ProcessEnv;
}

export type CommandRunner = (
	command: string,
	args: string[],
	options: RunCommandOptions,
) => Promise<CommandResult>;

export const runCommand: CommandRunner = (command, args, options) =>
	new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			env: options.env ?? process.env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");
		child.stdout?.on("data", (chunk: string) => (stdout += chunk));
		child.stderr?.on("data", (chunk: string) => (stderr += chunk));
		child.once("error", reject);
		child.once("exit", (code) =>
			resolve({ exitCode: code ?? 1, stdout, stderr }),
		);
	});

function requiredString(
	record: Record<string, unknown>,
	names: string[],
	label: string,
): string {
	for (const name of names) {
		const value = record[name];
		if (typeof value === "string" && value.length > 0) return value;
	}
	throw new Error(`Local Supabase status is missing ${label}.`);
}

function optionalString(
	record: Record<string, unknown>,
	names: string[],
): string | undefined {
	for (const name of names) {
		const value = record[name];
		if (typeof value === "string" && value.length > 0) return value;
	}
	return undefined;
}

export function parseSupabaseStatus(source: string): LocalSupabaseStatus {
	let parsed: unknown;
	try {
		parsed = JSON.parse(source);
	} catch {
		throw new Error("Local Supabase status returned malformed JSON.");
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("Local Supabase status must be a JSON object.");
	}
	const record = parsed as Record<string, unknown>;
	const status: LocalSupabaseStatus = {
		projectId: localSupabaseProjectId,
		apiUrl: requiredString(record, ["API_URL", "api_url"], "the API URL"),
		databaseUrl: requiredString(
			record,
			["DB_URL", "db_url"],
			"the database URL",
		),
		publishableKey: requiredString(
			record,
			["PUBLISHABLE_KEY", "publishable_key", "ANON_KEY", "anon_key"],
			"a publishable or anon key",
		),
		serviceRoleKey: optionalString(record, [
			"SECRET_KEY",
			"secret_key",
			"SERVICE_ROLE_KEY",
			"service_role_key",
		]),
		mailpitUrl: requiredString(
			record,
			["INBUCKET_URL", "inbucket_url", "MAILPIT_URL", "mailpit_url"],
			"the Mailpit URL",
		),
		studioUrl: optionalString(record, ["STUDIO_URL", "studio_url"]),
	};
	assertLocalSupabaseSafety(status);
	return status;
}

function isLoopback(hostname: string): boolean {
	return (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "[::1]" ||
		hostname === "::1"
	);
}

function assertLoopbackUrl(value: string, label: string, expectedPort: number) {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`${label} is not a valid local URL.`);
	}
	if (!isLoopback(url.hostname) || Number(url.port) !== expectedPort) {
		throw new Error(`${label} must use loopback port ${expectedPort}.`);
	}
}

export function assertLocalSupabaseSafety(input: {
	projectId: string;
	apiUrl?: string;
	databaseUrl?: string;
	mailpitUrl?: string;
	studioUrl?: string;
}) {
	if (input.projectId !== localSupabaseProjectId) {
		throw new Error(`Refusing lifecycle operation for a non-local project ID.`);
	}
	if (input.apiUrl)
		assertLoopbackUrl(
			input.apiUrl,
			"Local Supabase API",
			localSupabasePorts.api,
		);
	if (input.databaseUrl) {
		assertLoopbackUrl(
			input.databaseUrl,
			"Local Supabase database",
			localSupabasePorts.database,
		);
	}
	if (input.mailpitUrl)
		assertLoopbackUrl(
			input.mailpitUrl,
			"Local Mailpit",
			localSupabasePorts.mailpit,
		);
	if (input.studioUrl)
		assertLoopbackUrl(
			input.studioUrl,
			"Local Studio",
			localSupabasePorts.studio,
		);
}

export function assertSupportedNodeVersion(version = process.versions.node) {
	const major = Number(version.split(".")[0]);
	if (!Number.isInteger(major) || major < 20) {
		throw new Error("Local Supabase development requires Node.js 20 or newer.");
	}
}

async function runChecked(
	runner: CommandRunner,
	command: string,
	args: string[],
	options: RunCommandOptions,
): Promise<CommandResult> {
	const result = await runner(command, args, options);
	if (result.exitCode !== 0) {
		const diagnostic = `${result.stdout}\n${result.stderr}`;
		if (/port is already allocated/i.test(diagnostic)) {
			throw new Error(
				"Local Supabase could not start because one of its fixed loopback ports is already allocated.",
			);
		}
		if (/docker.*(not running|cannot connect|unreachable)/i.test(diagnostic)) {
			throw new Error(
				"Docker is not reachable for local Supabase development.",
			);
		}
		throw new Error(
			`Command failed (${command} ${args.join(" ")}) with exit code ${result.exitCode}.`,
		);
	}
	return result;
}

export async function readLocalProjectId(serverRoot: string): Promise<string> {
	const config = await readFile(
		path.join(serverRoot, "supabase/config.toml"),
		"utf8",
	);
	const match = config.match(/^project_id\s*=\s*"([^"]+)"/m);
	if (!match) throw new Error("supabase/config.toml is missing project_id.");
	return match[1];
}

export async function preflightLocalSupabase(
	serverRoot: string,
	runner: CommandRunner = runCommand,
) {
	assertSupportedNodeVersion();
	const projectId = await readLocalProjectId(serverRoot);
	assertLocalSupabaseSafety({ projectId });
	await runChecked(runner, "docker", ["info"], { cwd: serverRoot });
}

export async function readLocalSupabaseStatus(
	serverRoot: string,
	runner: CommandRunner = runCommand,
): Promise<LocalSupabaseStatus> {
	const result = await runChecked(
		runner,
		"pnpm",
		["exec", "supabase", "status", "--output", "json"],
		{ cwd: serverRoot },
	);
	return parseSupabaseStatus(result.stdout);
}

export function buildLocalBootstrapPlan() {
	return [
		{ command: "pnpm", args: ["db:migrate"] },
		{ command: "pnpm", args: ["seed:mockup"] },
	];
}

export async function bootstrapLocalDatabase(
	serverRoot: string,
	status: LocalSupabaseStatus,
	runner: CommandRunner = runCommand,
) {
	assertLocalSupabaseSafety(status);
	const env = { ...process.env, DATABASE_URL: status.databaseUrl };
	for (const step of buildLocalBootstrapPlan()) {
		await runChecked(runner, step.command, step.args, { cwd: serverRoot, env });
	}
}

export async function seedLocalDatabase(
	serverRoot: string,
	runner: CommandRunner = runCommand,
) {
	const status = await readLocalSupabaseStatus(serverRoot, runner);
	await runChecked(runner, "pnpm", ["seed:mockup"], {
		cwd: serverRoot,
		env: { ...process.env, DATABASE_URL: status.databaseUrl },
	});
}

export async function startLocalSupabase(
	serverRoot: string,
	runner: CommandRunner = runCommand,
): Promise<LocalSupabaseStatus> {
	await preflightLocalSupabase(serverRoot, runner);
	await runChecked(runner, "pnpm", ["exec", "supabase", "start"], {
		cwd: serverRoot,
	});
	const status = await readLocalSupabaseStatus(serverRoot, runner);
	await bootstrapLocalDatabase(serverRoot, status, runner);
	return status;
}

export async function stopLocalSupabase(
	serverRoot: string,
	options: { deleteData?: boolean; runner?: CommandRunner } = {},
) {
	const runner = options.runner ?? runCommand;
	const projectId = await readLocalProjectId(serverRoot);
	assertLocalSupabaseSafety({ projectId });
	const args = [
		"exec",
		"supabase",
		"stop",
		"--project-id",
		localSupabaseProjectId,
	];
	if (options.deleteData) args.push("--no-backup");
	await runChecked(runner, "pnpm", args, { cwd: serverRoot });
}

export async function resetLocalSupabase(
	serverRoot: string,
	runner: CommandRunner = runCommand,
) {
	await preflightLocalSupabase(serverRoot, runner);
	await stopLocalSupabase(serverRoot, { deleteData: true, runner });
	return startLocalSupabase(serverRoot, runner);
}
