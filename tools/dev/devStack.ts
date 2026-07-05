import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
	type DerivedDevProfile,
	deriveDevProfile,
	getTrustedProfilePaths,
	loadDevProfile,
	type ProfileKind,
	preflightManagedEnvFiles,
	redactSensitiveText,
	renderClientEnv,
	renderServerEnv,
	writeManagedEnvFiles,
} from "./devProfile";
import {
	type LocalSupabaseStatus,
	preflightLocalSupabase,
	readLocalSupabaseStatus,
	resetLocalSupabase,
	seedLocalDatabase,
	startLocalSupabase,
	stopLocalSupabase,
} from "./localSupabase";
import { type ChildSpec, runForegroundChildren } from "./processCoordinator";

export const serverRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);
const clientRoot = path.resolve(serverRoot, "../golden-years-client-next");

export interface DevStackDependencies {
	serverRoot: string;
	clientRoot: string;
	log(message: string): void;
	preflightLocalSupabase(root: string): Promise<void>;
	readLocalSupabaseStatus(root: string): Promise<LocalSupabaseStatus>;
	startLocalSupabase(root: string): Promise<LocalSupabaseStatus>;
	stopLocalSupabase(root: string): Promise<void>;
	resetLocalSupabase(root: string): Promise<LocalSupabaseStatus>;
	seedLocalDatabase(root: string): Promise<void>;
	runForegroundChildren(specs: ChildSpec[]): Promise<number>;
}

export const defaultDevStackDependencies: DevStackDependencies = {
	serverRoot,
	clientRoot,
	log: console.log,
	preflightLocalSupabase,
	readLocalSupabaseStatus,
	startLocalSupabase,
	stopLocalSupabase,
	resetLocalSupabase,
	seedLocalDatabase,
	runForegroundChildren,
};

function parseKind(value: string | undefined): ProfileKind {
	if (value !== "local" && value !== "remote") {
		throw new Error("Profile kind must be local or remote.");
	}
	return value;
}

async function validatePinnedDependency(dependencies: DevStackDependencies) {
	const packageJson = JSON.parse(
		await readFile(path.join(dependencies.serverRoot, "package.json"), "utf8"),
	) as {
		devDependencies?: Record<string, string>;
	};
	const version = packageJson.devDependencies?.supabase;
	if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
		throw new Error(
			"The Supabase CLI devDependency must use an exact pinned version.",
		);
	}
}

async function resolveProfile(
	kind: ProfileKind,
	dependencies: DevStackDependencies,
): Promise<DerivedDevProfile> {
	const paths = getTrustedProfilePaths(dependencies.serverRoot);
	const profile = await loadDevProfile(kind, paths);
	if (kind === "local") {
		return deriveDevProfile(
			profile,
			await dependencies.readLocalSupabaseStatus(dependencies.serverRoot),
		);
	}
	return deriveDevProfile(profile);
}

async function syncResolvedProfile(
	profile: DerivedDevProfile,
	force: boolean,
	dependencies: DevStackDependencies,
) {
	const paths = getTrustedProfilePaths(dependencies.serverRoot);
	const result = await writeManagedEnvFiles({
		serverPath: paths.serverEnvPaths[profile.kind],
		clientPath: paths.clientEnvPath,
		serverRoot: dependencies.serverRoot,
		clientRoot: dependencies.clientRoot,
		serverContent: renderServerEnv(profile),
		clientContent: renderClientEnv(profile),
		force,
	});
	for (const backup of result.backups)
		dependencies.log(`Backed up unmanaged file: ${backup}`);
	dependencies.log(
		`Synced ${profile.kind} server and client development environments.`,
	);
}

async function doctor(
	kind: ProfileKind,
	live: boolean,
	dependencies: DevStackDependencies,
) {
	await validatePinnedDependency(dependencies);
	const paths = getTrustedProfilePaths(dependencies.serverRoot);
	const profile = await loadDevProfile(kind, paths);
	if (kind === "remote") {
		deriveDevProfile(profile);
	} else if (live) {
		await dependencies.preflightLocalSupabase(dependencies.serverRoot);
		deriveDevProfile(
			profile,
			await dependencies.readLocalSupabaseStatus(dependencies.serverRoot),
		);
	} else {
		deriveDevProfile(profile, {
			apiUrl: "http://127.0.0.1:54321",
			publishableKey: "doctor-placeholder",
			databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
			mailpitUrl: "http://127.0.0.1:54324",
			studioUrl: "http://127.0.0.1:54323",
		});
	}
	dependencies.log(
		`${kind} profile is valid${live ? " and its local services are healthy" : ""}.`,
	);
}

async function sync(
	kind: ProfileKind,
	force: boolean,
	dependencies: DevStackDependencies,
) {
	await syncResolvedProfile(
		await resolveProfile(kind, dependencies),
		force,
		dependencies,
	);
}

async function startStack(
	kind: ProfileKind,
	force: boolean,
	dependencies: DevStackDependencies,
) {
	const paths = getTrustedProfilePaths(dependencies.serverRoot);
	const rawProfile = await loadDevProfile(kind, paths);
	await preflightManagedEnvFiles({
		serverPath: paths.serverEnvPaths[kind],
		clientPath: paths.clientEnvPath,
		serverRoot: dependencies.serverRoot,
		clientRoot: dependencies.clientRoot,
		force,
	});
	const profile =
		kind === "local"
			? deriveDevProfile(
					rawProfile,
					await dependencies.startLocalSupabase(dependencies.serverRoot),
				)
			: deriveDevProfile(rawProfile);
	await syncResolvedProfile(profile, force, dependencies);

	dependencies.log(profile.banner);
	dependencies.log(`Browser: ${profile.browserOrigin}`);
	dependencies.log(`API: ${profile.apiOrigin}`);
	if (profile.mailpitUrl) dependencies.log(`Mailpit: ${profile.mailpitUrl}`);
	if (profile.studioUrl) dependencies.log(`Studio: ${profile.studioUrl}`);

	const api = new URL(profile.apiOrigin);
	const exitCode = await dependencies.runForegroundChildren([
		{
			command: "pnpm",
			args: [
				"exec",
				"wrangler",
				"dev",
				"--env",
				profile.wranglerEnv,
				"--ip",
				api.hostname,
				"--port",
				api.port,
			],
			cwd: dependencies.serverRoot,
		},
		{
			command: "pnpm",
			args: [
				"exec",
				"vite",
				"--host",
				profile.vite.host,
				"--port",
				String(profile.vite.port),
				"--strictPort",
			],
			cwd: dependencies.clientRoot,
		},
	]);
	return exitCode;
}

function hasFlag(args: string[], flag: string) {
	return args.includes(flag);
}

export async function main(
	args = process.argv.slice(2),
	dependencies: DevStackDependencies = defaultDevStackDependencies,
) {
	const [command, target] = args;
	const force = hasFlag(args, "--force");
	switch (command) {
		case "start":
			return startStack(parseKind(target), force, dependencies);
		case "doctor":
			await doctor(parseKind(target), hasFlag(args, "--live"), dependencies);
			return 0;
		case "sync":
			await sync(parseKind(target), force, dependencies);
			return 0;
		case "supabase":
			switch (target) {
				case "start": {
					const status = await dependencies.startLocalSupabase(
						dependencies.serverRoot,
					);
					dependencies.log("Local Supabase is ready.");
					dependencies.log(`API: ${status.apiUrl}`);
					dependencies.log(`Mailpit: ${status.mailpitUrl}`);
					if (status.studioUrl) dependencies.log(`Studio: ${status.studioUrl}`);
					return 0;
				}
				case "status": {
					const status = await dependencies.readLocalSupabaseStatus(
						dependencies.serverRoot,
					);
					dependencies.log("Local Supabase is healthy.");
					dependencies.log(`API: ${status.apiUrl}`);
					dependencies.log(`Mailpit: ${status.mailpitUrl}`);
					if (status.studioUrl) dependencies.log(`Studio: ${status.studioUrl}`);
					return 0;
				}
				case "stop":
					await dependencies.stopLocalSupabase(dependencies.serverRoot);
					dependencies.log("Local Supabase stopped; data was retained.");
					return 0;
				case "reset":
					await dependencies.resetLocalSupabase(dependencies.serverRoot);
					dependencies.log(
						"Local Supabase data was reset, migrated, and reseeded.",
					);
					return 0;
				default:
					throw new Error(
						"Supabase action must be start, status, stop, or reset.",
					);
			}
		case "seed-local":
			await dependencies.seedLocalDatabase(dependencies.serverRoot);
			dependencies.log("Local Supabase seed data is current.");
			return 0;
		default:
			throw new Error(
				"Usage: devStack <start|doctor|sync|supabase|seed-local> [local|remote|action]",
			);
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	try {
		process.exitCode = await main();
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Unknown development orchestrator failure.";
		console.error(redactSensitiveText(message));
		process.exitCode = 1;
	}
}
