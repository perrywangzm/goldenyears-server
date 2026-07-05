import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import {
	deriveDevProfile,
	getTrustedProfilePaths,
	loadDevProfile,
	parseProfileDocument,
} from "./devProfile";
import { localSupabasePorts, localSupabaseProjectId } from "./localSupabase";

const root = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);
const clientRoot = path.resolve(root, "../golden-years-client-next");

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

async function json(filePath: string) {
	return JSON.parse(await readFile(filePath, "utf8")) as Record<
		string,
		unknown
	>;
}

async function assertMissing(filePath: string, message: string) {
	try {
		await lstat(filePath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
		throw error;
	}
	throw new Error(message);
}

function includesLine(source: string, line: string) {
	return source.split(/\r?\n/).includes(line);
}

function parseTomlSubset(source: string) {
	const values: Record<string, unknown> = {};
	let section = "";
	for (const rawLine of source.split(/\r?\n/)) {
		let quoted = false;
		let line = "";
		for (const character of rawLine) {
			if (character === '"') quoted = !quoted;
			if (character === "#" && !quoted) break;
			line += character;
		}
		line = line.trim();
		if (!line) continue;
		const sectionMatch = line.match(/^\[([A-Za-z0-9_.-]+)\]$/);
		if (sectionMatch) {
			section = sectionMatch[1];
			continue;
		}
		const separator = line.indexOf("=");
		assert(separator > 0, `Unsupported TOML line: ${line}`);
		const key = line.slice(0, separator).trim();
		const rawValue = line.slice(separator + 1).trim();
		const fullKey = section ? `${section}.${key}` : key;
		assert(!(fullKey in values), `Duplicate TOML key: ${fullKey}`);
		if (rawValue === "true" || rawValue === "false") {
			values[fullKey] = rawValue === "true";
		} else if (/^-?\d+$/.test(rawValue)) {
			values[fullKey] = Number(rawValue);
		} else {
			try {
				values[fullKey] = JSON.parse(rawValue);
			} catch {
				throw new Error(`Unsupported TOML value for ${fullKey}.`);
			}
		}
	}
	return values;
}

export async function checkDevProfiles() {
	const serverPackage = (await json(path.join(root, "package.json"))) as {
		scripts?: Record<string, string>;
		devDependencies?: Record<string, string>;
	};
	assert(
		/^\d+\.\d+\.\d+$/.test(serverPackage.devDependencies?.supabase ?? ""),
		"Supabase CLI must be exactly pinned.",
	);
	for (const script of [
		"dev:stack:local",
		"dev:stack:remote",
		"dev:profile:doctor",
		"dev:profile:sync",
		"dev:supabase:start",
		"dev:supabase:status",
		"dev:supabase:stop",
		"dev:supabase:reset",
		"db:migrate",
		"dev:seed:local",
		"smoke:dev-stack:local",
		"test:dev-orchestration-harness",
		"check:dev-profiles",
	]) {
		assert(
			serverPackage.scripts?.[script],
			`Missing package script: ${script}`,
		);
	}

	const paths = getTrustedProfilePaths(root);
	const document = parseProfileDocument(await json(paths.profilePath));
	const remote = document.profiles.remote;
	assert(
		remote.supabaseUrl === `\${GY_REMOTE_SUPABASE_URL}`,
		"Remote Supabase URL must use its exact shell placeholder.",
	);
	assert(
		remote.supabasePublishableKey === `\${GY_REMOTE_SUPABASE_PUBLISHABLE_KEY}`,
		"Remote publishable key must use its exact shell placeholder.",
	);
	assert(
		remote.databaseConnectionString ===
			`\${GY_REMOTE_DATABASE_CONNECTION_STRING}`,
		"Remote DB must use its exact shell placeholder.",
	);
	const local = await loadDevProfile("local", paths, {});
	deriveDevProfile(local, {
		apiUrl: `http://127.0.0.1:${localSupabasePorts.api}`,
		publishableKey: "static-check",
		databaseUrl: `postgresql://postgres:postgres@127.0.0.1:${localSupabasePorts.database}/postgres`,
		mailpitUrl: `http://127.0.0.1:${localSupabasePorts.mailpit}`,
		studioUrl: `http://127.0.0.1:${localSupabasePorts.studio}`,
	});

	const configSource = await readFile(
		path.join(root, "supabase/config.toml"),
		"utf8",
	);
	const config = parseTomlSubset(configSource);
	for (const [key, expected] of Object.entries({
		project_id: localSupabaseProjectId,
		"api.port": localSupabasePorts.api,
		"db.port": localSupabasePorts.database,
		"studio.port": localSupabasePorts.studio,
		"local_smtp.port": localSupabasePorts.mailpit,
		"db.migrations.enabled": false,
		"db.seed.enabled": false,
		"auth.site_url": "http://localhost:5173",
		"auth.additional_redirect_urls": ["http://localhost:5173/login"],
		"auth.email.enable_confirmations": true,
		"auth.email.template.confirmation.content_path":
			"./supabase/templates/confirmation.html",
		"auth.email.template.recovery.content_path":
			"./supabase/templates/recovery.html",
	})) {
		assert(
			JSON.stringify(config[key]) === JSON.stringify(expected),
			`Supabase config drift at ${key}.`,
		);
	}
	await assertMissing(
		path.join(root, "supabase/migrations"),
		"Application migrations must not be copied into supabase/migrations.",
	);
	for (const template of ["confirmation.html", "recovery.html"]) {
		const source = await readFile(
			path.join(root, "supabase/templates", template),
			"utf8",
		);
		const visibleText = source
			.replace(/<!--[\s\S]*?-->/g, "")
			.replace(/<[^>]+>/g, " ");
		assert(
			visibleText.includes("{{ .Token }}"),
			`${template} must expose the OTP token.`,
		);
	}

	const gitignore = await readFile(path.join(root, ".gitignore"), "utf8");
	assert(
		includesLine(gitignore, "tools/dev/dev-profiles.local.json"),
		"Remote profile overlay must be gitignored.",
	);
	const clientPackage = (await json(path.join(clientRoot, "package.json"))) as {
		scripts?: Record<string, string>;
	};
	assert(
		clientPackage.scripts?.dev ===
			"vite --host localhost --port 5173 --strictPort",
		"Client dev origin must remain canonical and strict.",
	);
	const clientExample = await readFile(
		path.join(clientRoot, ".env.local.example"),
		"utf8",
	);
	assert(
		!/SUPABASE|DATABASE|HYPERDRIVE/.test(clientExample),
		"Frontend env example crossed the secret boundary.",
	);
	const wranglerSource = await readFile(
		path.join(root, "wrangler.jsonc"),
		"utf8",
	);
	const parsedWrangler = ts.parseConfigFileTextToJson(
		"wrangler.jsonc",
		wranglerSource,
	);
	assert(!parsedWrangler.error, "wrangler.jsonc must parse as JSONC.");
	const wrangler = parsedWrangler.config as {
		env?: {
			local?: { hyperdrive?: Array<{ localConnectionString?: string }> };
		};
	};
	assert(
		wrangler.env?.local?.hyperdrive?.[0]?.localConnectionString ===
			"postgresql://postgres:postgres@127.0.0.1:54322/postgres",
		"Wrangler local fallback must use the local Supabase database port.",
	);
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	await checkDevProfiles();
	console.log("Development profile static checks passed.");
}
