import { constants } from "node:fs";
import {
	chmod,
	copyFile,
	lstat,
	mkdir,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const managedEnvMarker = "# golden-years-dev-profile:v1";

const commonProfileFields = {
	browserOrigin: z.string().min(1),
	apiOrigin: z.string().min(1),
};

export const localProfileSchema = z
	.object({
		kind: z.literal("local"),
		wranglerEnv: z.literal("local"),
		...commonProfileFields,
	})
	.strict();

export const remoteProfileSchema = z
	.object({
		kind: z.literal("remote"),
		wranglerEnv: z.literal("remote"),
		...commonProfileFields,
		supabaseUrl: z.string().min(1),
		supabasePublishableKey: z.string().min(1),
		databaseConnectionString: z.string().min(1),
	})
	.strict();

export const devProfileSchema = z.discriminatedUnion("kind", [
	localProfileSchema,
	remoteProfileSchema,
]);

const profileDocumentSchema = z
	.object({
		version: z.literal(1),
		profiles: z
			.object({
				local: localProfileSchema,
				remote: remoteProfileSchema,
			})
			.strict(),
	})
	.strict();

const overlaySchema = z
	.object({
		version: z.literal(1).optional(),
		profiles: z
			.object({
				local: localProfileSchema.partial().optional(),
				remote: remoteProfileSchema.partial().optional(),
			})
			.strict()
			.optional(),
	})
	.strict();

export type DevProfile = z.infer<typeof devProfileSchema>;
export type ProfileKind = DevProfile["kind"];

export interface LocalSupabaseCredentials {
	apiUrl: string;
	publishableKey: string;
	databaseUrl: string;
	mailpitUrl?: string;
	studioUrl?: string;
	serviceRoleKey?: string;
}

export interface DerivedDevProfile {
	kind: ProfileKind;
	wranglerEnv: ProfileKind;
	browserOrigin: string;
	apiOrigin: string;
	databaseUrl: string;
	mailpitUrl?: string;
	studioUrl?: string;
	vite: { host: string; port: number };
	serverEnv: Record<string, string>;
	clientEnv: Record<string, string>;
	banner: string;
	dataRisk: "disposable-local" | "persistent-remote";
}

export interface TrustedProfilePaths {
	profilePath: string;
	overlayPath: string;
	serverEnvPaths: Record<ProfileKind, string>;
	clientEnvPath: string;
}

export function getTrustedProfilePaths(
	serverRoot: string,
): TrustedProfilePaths {
	return {
		profilePath: path.join(serverRoot, "tools/dev/dev-profiles.example.json"),
		overlayPath: path.join(serverRoot, "tools/dev/dev-profiles.local.json"),
		serverEnvPaths: {
			local: path.join(serverRoot, ".env.local.local"),
			remote: path.join(serverRoot, ".env.remote.local"),
		},
		clientEnvPath: path.resolve(
			serverRoot,
			"../golden-years-client-next/.env.local",
		),
	};
}

function formatValidationError(error: z.ZodError): string {
	const issues = error.issues.map(
		(issue) => `${issue.path.join(".") || "document"}: ${issue.message}`,
	);
	return `Invalid dev profile: ${issues.join("; ")}`;
}

export function parseProfileDocument(input: unknown) {
	const parsed = profileDocumentSchema.safeParse(input);
	if (!parsed.success) {
		throw new Error(formatValidationError(parsed.error));
	}
	return parsed.data;
}

function parseOverlay(input: unknown) {
	const parsed = overlaySchema.safeParse(input);
	if (!parsed.success) {
		throw new Error(formatValidationError(parsed.error));
	}
	return parsed.data;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function deepMerge<T>(base: T, overlay: unknown): T {
	if (!isPlainObject(base) || !isPlainObject(overlay)) {
		return overlay as T;
	}

	const merged: Record<string, unknown> = { ...base };
	for (const [key, value] of Object.entries(overlay)) {
		merged[key] = key in merged ? deepMerge(merged[key], value) : value;
	}
	return merged as T;
}

const exactPlaceholder = /^\$\{([A-Z_][A-Z0-9_]*)\}$/;

export function expandPlaceholders<T>(
	value: T,
	environment: NodeJS.ProcessEnv,
): T {
	if (typeof value === "string") {
		const exact = value.match(exactPlaceholder);
		if (exact) {
			const resolved = environment[exact[1]];
			if (!resolved) {
				throw new Error(`Unresolved environment placeholder: ${exact[1]}`);
			}
			return resolved as T;
		}
		if (value.includes("${")) {
			throw new Error(
				`Environment values must use an exact placeholder such as \${ENV_VAR}.`,
			);
		}
		return value;
	}
	if (Array.isArray(value)) {
		return value.map((entry) => expandPlaceholders(entry, environment)) as T;
	}
	if (isPlainObject(value)) {
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [
				key,
				expandPlaceholders(entry, environment),
			]),
		) as T;
	}
	return value;
}

async function readJson(filePath: string): Promise<unknown> {
	try {
		return JSON.parse(await readFile(filePath, "utf8"));
	} catch (error) {
		if (error instanceof SyntaxError) {
			throw new Error(`Invalid JSON in ${path.basename(filePath)}.`);
		}
		throw error;
	}
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await lstat(filePath);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
		throw error;
	}
}

export async function loadDevProfiles(
	paths: Pick<TrustedProfilePaths, "profilePath" | "overlayPath">,
	environment: NodeJS.ProcessEnv = process.env,
) {
	const committed = parseProfileDocument(await readJson(paths.profilePath));
	const overlay = (await fileExists(paths.overlayPath))
		? parseOverlay(await readJson(paths.overlayPath))
		: {};
	return parseProfileDocument(
		expandPlaceholders(deepMerge(committed, overlay), environment),
	);
}

export async function loadDevProfile(
	kind: ProfileKind,
	paths: Pick<TrustedProfilePaths, "profilePath" | "overlayPath">,
	environment: NodeJS.ProcessEnv = process.env,
): Promise<DevProfile> {
	const committed = parseProfileDocument(await readJson(paths.profilePath));
	const overlay = (await fileExists(paths.overlayPath))
		? parseOverlay(await readJson(paths.overlayPath))
		: {};
	const merged = deepMerge(committed, overlay);
	const parsed = devProfileSchema.safeParse(
		expandPlaceholders(merged.profiles[kind], environment),
	);
	if (!parsed.success) throw new Error(formatValidationError(parsed.error));
	if (parsed.data.kind !== kind)
		throw new Error(`Profile ${kind} has a mismatched kind.`);
	return parsed.data;
}

function parseOrigin(value: string, label: string): URL {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`${label} must be a valid URL origin.`);
	}
	if (
		url.origin !== value ||
		url.username ||
		url.password ||
		!["http:", "https:"].includes(url.protocol)
	) {
		throw new Error(
			`${label} must be an origin without credentials, path, query, or fragment.`,
		);
	}
	if (!url.port) {
		throw new Error(`${label} must include an explicit port.`);
	}
	return url;
}

function isLoopbackHostname(hostname: string): boolean {
	return (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "[::1]" ||
		hostname === "::1"
	);
}

function assertLoopbackOrigin(url: URL, label: string) {
	if (!isLoopbackHostname(url.hostname)) {
		throw new Error(`${label} must use a loopback hostname.`);
	}
}

function parseDatabaseUrl(value: string): URL {
	try {
		const url = new URL(value);
		if (
			!["postgres:", "postgresql:"].includes(url.protocol) ||
			!url.username ||
			!url.password ||
			!url.hostname
		)
			throw new Error();
		return url;
	} catch {
		throw new Error("Database connection string must be a PostgreSQL URL.");
	}
}

export function deriveDevProfile(
	rawProfile: DevProfile,
	localCredentials?: LocalSupabaseCredentials,
): DerivedDevProfile {
	const parsed = devProfileSchema.safeParse(rawProfile);
	if (!parsed.success) throw new Error(formatValidationError(parsed.error));
	const profile = parsed.data;
	const browser = parseOrigin(profile.browserOrigin, "browserOrigin");
	const api = parseOrigin(profile.apiOrigin, "apiOrigin");
	assertLoopbackOrigin(browser, "browserOrigin");
	assertLoopbackOrigin(api, "apiOrigin");

	let supabaseUrl: string;
	let publishableKey: string;
	let databaseUrl: string;
	let mailpitUrl: string | undefined;
	let studioUrl: string | undefined;

	if (profile.kind === "local") {
		if (!localCredentials)
			throw new Error(
				"Local Supabase status is required to resolve the local profile.",
			);
		let localApi: URL;
		try {
			localApi = new URL(localCredentials.apiUrl);
		} catch {
			throw new Error("Local Supabase API status must be a valid URL.");
		}
		const localDb = parseDatabaseUrl(localCredentials.databaseUrl);
		if (
			!isLoopbackHostname(localApi.hostname) ||
			!isLoopbackHostname(localDb.hostname)
		) {
			throw new Error(
				"Local Supabase credentials must point to loopback services.",
			);
		}
		supabaseUrl = localCredentials.apiUrl;
		publishableKey = localCredentials.publishableKey;
		databaseUrl = localCredentials.databaseUrl;
		mailpitUrl = localCredentials.mailpitUrl;
		studioUrl = localCredentials.studioUrl;
	} else {
		let remoteSupabase: URL;
		try {
			remoteSupabase = new URL(profile.supabaseUrl);
		} catch {
			throw new Error("Remote supabaseUrl must be an HTTPS origin.");
		}
		if (
			remoteSupabase.protocol !== "https:" ||
			remoteSupabase.origin !== profile.supabaseUrl
		) {
			throw new Error("Remote supabaseUrl must be an HTTPS origin.");
		}
		const remoteDb = parseDatabaseUrl(profile.databaseConnectionString);
		if (
			!remoteDb.hostname.endsWith(".pooler.supabase.com") ||
			remoteDb.port !== "5432"
		) {
			throw new Error(
				"Remote databaseConnectionString must use the Supabase session pooler on port 5432.",
			);
		}
		supabaseUrl = profile.supabaseUrl;
		publishableKey = profile.supabasePublishableKey;
		databaseUrl = profile.databaseConnectionString;
	}

	return {
		kind: profile.kind,
		wranglerEnv: profile.wranglerEnv,
		browserOrigin: browser.origin,
		apiOrigin: api.origin,
		databaseUrl,
		mailpitUrl,
		studioUrl,
		vite: { host: browser.hostname, port: Number(browser.port) },
		serverEnv: {
			CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: databaseUrl,
			CORS_ORIGIN: browser.origin,
			SUPABASE_AUTH_REDIRECT_URL: `${browser.origin}/login`,
			SUPABASE_PUBLISHABLE_KEY: publishableKey,
			SUPABASE_URL: supabaseUrl,
		},
		clientEnv: {
			VITE_API_BASE_URL: `${api.origin}/api/v1`,
			VITE_USE_MOCK_API: "false",
		},
		banner:
			profile.kind === "local"
				? "LOCAL: disposable Supabase data; email is captured locally."
				: "REMOTE: hosted Supabase data is persistent.",
		dataRisk:
			profile.kind === "local" ? "disposable-local" : "persistent-remote",
	};
}

function renderEnv(values: Record<string, string>): string {
	const lines = Object.entries(values)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, value]) => {
			if (/[\r\n]/.test(value))
				throw new Error(`Environment value ${key} must be one line.`);
			return `${key}=${value}`;
		});
	return `${managedEnvMarker}\n# Generated by pnpm dev:profile:sync. Do not edit.\n${lines.join("\n")}\n`;
}

export function renderServerEnv(profile: DerivedDevProfile): string {
	return renderEnv(profile.serverEnv);
}

export function renderClientEnv(profile: DerivedDevProfile): string {
	const forbidden = Object.keys(profile.clientEnv).find((key) =>
		/SUPABASE|DATABASE|HYPERDRIVE/.test(key),
	);
	if (forbidden)
		throw new Error(
			`Frontend environment contains forbidden secret boundary key: ${forbidden}`,
		);
	return renderEnv(profile.clientEnv);
}

interface FileState {
	path: string;
	exists: boolean;
	content?: Buffer;
	mode?: number;
	managed: boolean;
}

export interface ManagedEnvFileSystem {
	chmod: typeof chmod;
	copyFile: typeof copyFile;
	lstat: typeof lstat;
	mkdir: typeof mkdir;
	readFile: typeof readFile;
	rename: typeof rename;
	rm: typeof rm;
	writeFile: typeof writeFile;
}

export const defaultManagedEnvFileSystem: ManagedEnvFileSystem = {
	chmod,
	copyFile,
	lstat,
	mkdir,
	readFile,
	rename,
	rm,
	writeFile,
};

async function inspectOutput(
	filePath: string,
	fileSystem: ManagedEnvFileSystem,
): Promise<FileState> {
	try {
		const stat = await fileSystem.lstat(filePath);
		if (stat.isSymbolicLink())
			throw new Error(`Refusing to write symlink output: ${filePath}`);
		if (!stat.isFile())
			throw new Error(`Refusing to replace non-file output: ${filePath}`);
		const content = await fileSystem.readFile(filePath);
		return {
			path: filePath,
			exists: true,
			content,
			mode: stat.mode,
			managed:
				content.toString("utf8").split(/\r?\n/, 1)[0] === managedEnvMarker,
		};
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return { path: filePath, exists: false, managed: false };
		}
		throw error;
	}
}

function defaultBackupTimestamp(): string {
	return new Date()
		.toISOString()
		.replace(/[-:]/g, "")
		.replace(/\.\d{3}Z$/, "Z");
}

export interface WriteManagedEnvFilesInput {
	serverPath: string;
	clientPath: string;
	serverRoot?: string;
	clientRoot?: string;
	serverContent: string;
	clientContent: string;
	force?: boolean;
	backupTimestamp?: string;
	fileSystem?: ManagedEnvFileSystem;
}

async function assertTrustedAncestors(
	filePath: string,
	trustedRoot: string | undefined,
	fileSystem: ManagedEnvFileSystem,
) {
	if (!trustedRoot) return;
	const relative = path.relative(trustedRoot, filePath);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		throw new Error(`Refusing output outside its trusted root: ${filePath}`);
	}
	const directorySegments = path
		.dirname(relative)
		.split(path.sep)
		.filter(Boolean);
	let current = trustedRoot;
	for (const segment of ["", ...directorySegments]) {
		if (segment) current = path.join(current, segment);
		try {
			const stat = await fileSystem.lstat(current);
			if (stat.isSymbolicLink()) {
				throw new Error(`Refusing output beneath symlink ancestor: ${current}`);
			}
			if (!stat.isDirectory()) {
				throw new Error(
					`Refusing output beneath non-directory ancestor: ${current}`,
				);
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
			throw error;
		}
	}
}

export async function preflightManagedEnvFiles(input: {
	serverPath: string;
	clientPath: string;
	serverRoot?: string;
	clientRoot?: string;
	force?: boolean;
	fileSystem?: ManagedEnvFileSystem;
}) {
	const fileSystem = input.fileSystem ?? defaultManagedEnvFileSystem;
	await Promise.all([
		assertTrustedAncestors(input.serverPath, input.serverRoot, fileSystem),
		assertTrustedAncestors(input.clientPath, input.clientRoot, fileSystem),
	]);
	const states = await Promise.all([
		inspectOutput(input.serverPath, fileSystem),
		inspectOutput(input.clientPath, fileSystem),
	]);
	const unmanaged = states.filter((state) => state.exists && !state.managed);
	if (unmanaged.length > 0 && !input.force) {
		throw new Error(
			`Refusing to overwrite unmanaged file: ${unmanaged[0].path}. Re-run with --force to back it up.`,
		);
	}
	return states;
}

export async function writeManagedEnvFiles(input: WriteManagedEnvFilesInput) {
	const fileSystem = input.fileSystem ?? defaultManagedEnvFileSystem;
	const targets = [
		{ path: input.serverPath, content: input.serverContent },
		{ path: input.clientPath, content: input.clientContent },
	];
	const states = await preflightManagedEnvFiles({ ...input, fileSystem });
	const unmanaged = states.filter((state) => state.exists && !state.managed);

	const backups: string[] = [];
	const timestamp = input.backupTimestamp ?? defaultBackupTimestamp();
	for (const state of unmanaged) {
		const backupPath = `${state.path}.bak.${timestamp}`;
		await fileSystem.copyFile(state.path, backupPath, constants.COPYFILE_EXCL);
		await fileSystem.chmod(backupPath, 0o600);
		backups.push(backupPath);
	}

	const tempPaths: string[] = [];
	try {
		for (const [index, target] of targets.entries()) {
			await fileSystem.mkdir(path.dirname(target.path), { recursive: true });
			const tempPath = path.join(
				path.dirname(target.path),
				`.${path.basename(target.path)}.${process.pid}.${index}.tmp`,
			);
			await fileSystem.writeFile(tempPath, target.content, {
				encoding: "utf8",
				flag: "wx",
				mode: 0o600,
			});
			tempPaths.push(tempPath);
		}

		for (let index = 0; index < targets.length; index += 1) {
			await fileSystem.rename(tempPaths[index], targets[index].path);
		}
	} catch (error) {
		await Promise.all(
			tempPaths.map((tempPath) => fileSystem.rm(tempPath, { force: true })),
		);
		await Promise.all(
			states.map(async (state) => {
				if (!state.exists) {
					await fileSystem.rm(state.path, { force: true });
					return;
				}
				if (state.content) {
					await fileSystem.writeFile(state.path, state.content, {
						mode: state.mode === undefined ? undefined : state.mode & 0o777,
					});
					if (state.mode !== undefined) {
						await fileSystem.chmod(state.path, state.mode & 0o777);
					}
				}
			}),
		);
		throw error;
	}

	return { backups };
}

export function redactSensitiveText(
	value: string,
	secrets: string[] = [],
): string {
	let redacted = value;
	for (const secret of secrets
		.filter(Boolean)
		.sort((a, b) => b.length - a.length)) {
		redacted = redacted.split(secret).join("[REDACTED]");
	}
	redacted = redacted.replace(
		/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/gi,
		"$1[REDACTED]@",
	);
	redacted = redacted.replace(
		/((?:KEY|TOKEN|SECRET|PASSWORD)=)[^\s]+/gi,
		"$1[REDACTED]",
	);
	return redacted;
}
