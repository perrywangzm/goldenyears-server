import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
	deriveDevProfile,
	getTrustedProfilePaths,
	loadDevProfile,
	renderClientEnv,
	renderServerEnv,
	writeManagedEnvFiles,
} from "./devProfile";
import { resetLocalSupabase } from "./localSupabase";

export const localSmokeScenarios = [
	"local-config-is-loopback-only",
	"health",
	"database-backed-search",
	"signup-email-capture",
	"verification",
	"login-session",
	"logout",
	"recovery-email-capture",
	"password-reset",
	"login-with-new-password",
] as const;

const serverRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);
const paths = getTrustedProfilePaths(serverRoot);

function delay(milliseconds: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function postJson(
	origin: string,
	route: string,
	body: Record<string, unknown>,
	headers: Record<string, string> = {},
) {
	const response = await fetch(`${origin}${route}`, {
		method: "POST",
		headers: { "content-type": "application/json", ...headers },
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		throw new Error(
			`Smoke request ${route} failed with HTTP ${response.status}.`,
		);
	}
	return response;
}

async function waitForWorker(origin: string) {
	let lastError: unknown;
	for (let attempt = 0; attempt < 60; attempt += 1) {
		try {
			await postJson(origin, "/api/v1/get_health", {});
			return;
		} catch (error) {
			lastError = error;
			await delay(500);
		}
	}
	throw lastError ?? new Error("Local Worker did not become healthy.");
}

interface MailpitMessage {
	ID?: string;
	id?: string;
	To?: Array<{ Address?: string }>;
	to?: Array<{ address?: string }>;
}

function messageId(message: MailpitMessage) {
	return message.ID ?? message.id;
}

function messageTargets(message: MailpitMessage) {
	return [
		...(message.To ?? []).map((entry) => entry.Address),
		...(message.to ?? []).map((entry) => entry.address),
	].filter(Boolean);
}

async function listMailpitMessages(
	mailpitUrl: string,
): Promise<MailpitMessage[]> {
	const response = await fetch(`${mailpitUrl}/api/v1/messages`);
	if (!response.ok)
		throw new Error(
			`Mailpit message list failed with HTTP ${response.status}.`,
		);
	const payload = (await response.json()) as
		| { messages?: MailpitMessage[] }
		| MailpitMessage[];
	return Array.isArray(payload) ? payload : (payload.messages ?? []);
}

async function waitForOtp(
	mailpitUrl: string,
	email: string,
	excludedId?: string,
) {
	for (let attempt = 0; attempt < 40; attempt += 1) {
		const message = (await listMailpitMessages(mailpitUrl)).find(
			(entry) =>
				messageId(entry) !== excludedId &&
				messageTargets(entry).some((target) => target === email),
		);
		const id = message && messageId(message);
		if (id) {
			const response = await fetch(
				`${mailpitUrl}/api/v1/message/${encodeURIComponent(id)}`,
			);
			if (!response.ok)
				throw new Error(
					`Mailpit message read failed with HTTP ${response.status}.`,
				);
			const payload = (await response.json()) as {
				HTML?: string;
				Text?: string;
				html?: string;
				text?: string;
			};
			const source = [payload.HTML, payload.Text, payload.html, payload.text]
				.filter(Boolean)
				.join("\n");
			const token = source.match(/\b\d{6}\b/)?.[0];
			if (token) return { id, token };
		}
		await delay(250);
	}
	throw new Error(`No local OTP email arrived for the smoke account.`);
}

function collectCookies(response: Response) {
	const headers = response.headers as Headers & {
		getSetCookie?: () => string[];
	};
	const values = headers.getSetCookie?.() ?? [
		response.headers.get("set-cookie") ?? "",
	];
	return values
		.map((value) => value.split(";", 1)[0])
		.filter(Boolean)
		.join("; ");
}

async function stopWorker(child: ChildProcess) {
	if (child.exitCode !== null || child.signalCode !== null) return;
	child.kill("SIGTERM");
	await Promise.race([
		new Promise<void>((resolve) => child.once("exit", () => resolve())),
		delay(5_000),
	]);
	if (child.exitCode === null && child.signalCode === null)
		child.kill("SIGKILL");
}

export async function smokeLocalStack() {
	const rawProfile = await loadDevProfile("local", paths, {});
	const status = await resetLocalSupabase(serverRoot);
	const mailpitUrl = status.mailpitUrl;
	if (!mailpitUrl)
		throw new Error("Local Supabase status did not include Mailpit.");
	const profile = deriveDevProfile(rawProfile, status);
	if (/supabase\.co|pooler\.supabase\.com/i.test(JSON.stringify(profile))) {
		throw new Error(
			"Local smoke configuration contains a hosted Supabase hostname.",
		);
	}
	await writeManagedEnvFiles({
		serverPath: paths.serverEnvPaths.local,
		clientPath: paths.clientEnvPath,
		serverContent: renderServerEnv(profile),
		clientContent: renderClientEnv(profile),
	});

	const api = new URL(profile.apiOrigin);
	const worker = spawn(
		"pnpm",
		[
			"exec",
			"wrangler",
			"dev",
			"--env",
			"local",
			"--ip",
			api.hostname,
			"--port",
			api.port,
		],
		{ cwd: serverRoot, stdio: ["ignore", "ignore", "pipe"] },
	);
	let workerError = "";
	worker.stderr?.setEncoding("utf8");
	worker.stderr?.on("data", (chunk: string) => {
		workerError = `${workerError}${chunk}`.slice(-4_000);
	});

	try {
		await waitForWorker(profile.apiOrigin);
		const search = await postJson(
			profile.apiOrigin,
			"/api/v1/public/search_facilities",
			{},
		);
		const searchPayload = (await search.json()) as { data?: unknown[] };
		if (!Array.isArray(searchPayload.data) || searchPayload.data.length === 0) {
			throw new Error(
				"Database-backed local search returned no seeded facilities.",
			);
		}

		const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
		const email = `local-smoke-${nonce}@example.test`;
		const oldPassword = `LocalSmoke-${nonce}!`;
		const newPassword = `LocalReset-${nonce}!`;
		await postJson(profile.apiOrigin, "/api/v1/user/auth/signup", {
			email,
			password: oldPassword,
			display_name: "Local Smoke",
		});
		const verification = await waitForOtp(mailpitUrl, email);
		await postJson(
			profile.apiOrigin,
			"/api/v1/user/auth/confirm_verification",
			{
				email,
				token: verification.token,
			},
		);

		const login = await postJson(profile.apiOrigin, "/api/v1/user/auth/login", {
			email,
			password: oldPassword,
		});
		const loginPayload = (await login.clone().json()) as {
			data?: { csrf_token?: string };
		};
		const csrf = loginPayload.data?.csrf_token;
		const cookies = collectCookies(login);
		if (!csrf || !cookies.includes("gy_user_session=")) {
			throw new Error(
				"Local login did not issue the Golden Years session and CSRF contract.",
			);
		}
		await postJson(
			profile.apiOrigin,
			"/api/v1/user/auth/logout",
			{},
			{
				cookie: cookies,
				"x-csrf-token": csrf,
			},
		);

		await postJson(
			profile.apiOrigin,
			"/api/v1/user/auth/request_password_reset",
			{ email },
		);
		const recovery = await waitForOtp(mailpitUrl, email, verification.id);
		await postJson(
			profile.apiOrigin,
			"/api/v1/user/auth/confirm_password_reset",
			{
				email,
				token: recovery.token,
				password: newPassword,
			},
		);
		await postJson(profile.apiOrigin, "/api/v1/user/auth/login", {
			email,
			password: newPassword,
		});
	} catch (error) {
		if (worker.exitCode !== null && workerError) {
			throw new Error(
				`Local Worker exited during smoke verification (details suppressed; inspect Wrangler locally).`,
			);
		}
		throw error;
	} finally {
		await stopWorker(worker);
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	await smokeLocalStack();
	console.log("Local stack smoke verification passed.");
}
