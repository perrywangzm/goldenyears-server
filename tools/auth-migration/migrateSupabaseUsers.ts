import pg from "pg";
import {
	buildUserMigrationInventory,
	type MigrationAppUser,
	type MigrationProviderUser,
	normalizeMigrationEmail,
	selectMigrationCandidates,
} from "./supabaseUserMigration";

type Mode = "inventory" | "migrate" | "reconcile";
type CliOptions = { mode: Mode; apply: boolean; limit: number; after?: string };

const { Pool } = pg;

function parseOptions(argv: string[]): CliOptions {
	const modeValue =
		argv.find((arg) => arg.startsWith("--mode="))?.split("=")[1] ?? "inventory";
	if (
		modeValue !== "inventory" &&
		modeValue !== "migrate" &&
		modeValue !== "reconcile"
	) {
		throw new Error("--mode must be inventory, migrate, or reconcile.");
	}
	const limitValue =
		argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? "25";
	const limit = Number(limitValue);
	if (!Number.isInteger(limit) || limit < 1 || limit > 500)
		throw new Error("--limit must be between 1 and 500.");
	return {
		mode: modeValue,
		apply: argv.includes("--apply"),
		limit,
		after: argv
			.find((arg) => arg.startsWith("--after="))
			?.slice("--after=".length),
	};
}

class SupabaseAdminClient {
	constructor(
		private readonly baseUrl: string,
		private readonly secretKey: string,
		private readonly redirectUrl: string | undefined,
	) {}

	async listUsers(): Promise<MigrationProviderUser[]> {
		const users: MigrationProviderUser[] = [];
		for (let page = 1; ; page += 1) {
			const response = await this.request(
				`/auth/v1/admin/users?page=${page}&per_page=1000`,
				{ method: "GET" },
			);
			const payload = (await response.json()) as {
				users?: MigrationProviderUser[];
			};
			const batch = payload.users ?? [];
			users.push(...batch);
			if (batch.length < 1000) return users;
		}
	}

	async createUserAndSendRecovery(
		email: string,
	): Promise<MigrationProviderUser> {
		const response = await this.request("/auth/v1/admin/users", {
			method: "POST",
			body: JSON.stringify({ email, email_confirm: true }),
		});
		const payload = (await response.json()) as
			| MigrationProviderUser
			| { user?: MigrationProviderUser };
		const user =
			(payload as { user?: MigrationProviderUser }).user ??
			(payload as MigrationProviderUser);
		if (!user?.id)
			throw new Error("Supabase admin create returned no user identity.");
		await this.sendRecovery(email);
		return user;
	}

	async sendRecovery(email: string) {
		const redirect = this.redirectUrl
			? `?redirect_to=${encodeURIComponent(this.redirectUrl)}`
			: "";
		await this.request(`/auth/v1/recover${redirect}`, {
			method: "POST",
			body: JSON.stringify({ email }),
		});
	}

	private async request(path: string, init: RequestInit) {
		const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
			...init,
			headers: {
				apikey: this.secretKey,
				Authorization: `Bearer ${this.secretKey}`,
				"Content-Type": "application/json",
			},
		});
		if (!response.ok)
			throw new Error(
				`Supabase admin request failed with status ${response.status}.`,
			);
		return response;
	}
}

async function loadAppUsers(pool: pg.Pool): Promise<MigrationAppUser[]> {
	const result = await pool.query<MigrationAppUser>(
		"select id, email::text as email, status::text as status, auth_user_id::text from users order by id",
	);
	return result.rows;
}

async function linkUser(
	pool: pg.Pool,
	appUserId: string,
	authUserId: string,
	source: "existing" | "created",
) {
	const client = await pool.connect();
	try {
		await client.query("begin");
		const linked = await client.query(
			"update users set auth_user_id = $1::uuid, updated_at = now() where id = $2 and auth_user_id is null returning id",
			[authUserId, appUserId],
		);
		if (linked.rowCount === 0) {
			const current = await client.query<{ auth_user_id: string | null }>(
				"select auth_user_id::text from users where id = $1",
				[appUserId],
			);
			if (current.rows[0]?.auth_user_id !== authUserId)
				throw new Error("App user identity changed during migration.");
		} else {
			await client.query(
				`insert into audit_events (actor_user_id, action, resource_type, resource_id, metadata)
         values ($1, 'auth.offline_identity_linked', 'user', $1, jsonb_build_object('source', $2::text))`,
				[appUserId, source],
			);
		}
		await client.query("commit");
	} catch (error) {
		await client.query("rollback");
		throw error;
	} finally {
		client.release();
	}
}

async function main() {
	const options = parseOptions(process.argv.slice(2));
	const databaseUrl = process.env.DATABASE_URL;
	const supabaseUrl = process.env.SUPABASE_URL;
	const secretKey = process.env.SUPABASE_SECRET_KEY;
	if (!databaseUrl || !supabaseUrl || !secretKey) {
		throw new Error(
			"DATABASE_URL, SUPABASE_URL, and offline-only SUPABASE_SECRET_KEY are required.",
		);
	}

	const pool = new Pool({ connectionString: databaseUrl, max: 2 });
	const admin = new SupabaseAdminClient(
		supabaseUrl,
		secretKey,
		process.env.SUPABASE_AUTH_REDIRECT_URL,
	);
	try {
		const [appUsers, providerUsers] = await Promise.all([
			loadAppUsers(pool),
			admin.listUsers(),
		]);
		const before = buildUserMigrationInventory(appUsers, providerUsers);
		if (options.mode === "inventory" || options.mode === "reconcile") {
			process.stdout.write(
				`${JSON.stringify({ mode: options.mode, inventory: before }, null, 2)}\n`,
			);
			return;
		}

		const candidates = selectMigrationCandidates(
			appUsers,
			providerUsers,
			options,
		);
		const summary = {
			planned: candidates.length,
			linked_existing: 0,
			created_with_recovery: 0,
			failed: 0,
			dry_run: !options.apply,
		};
		if (options.apply) {
			for (const candidate of candidates) {
				try {
					const email = normalizeMigrationEmail(candidate.appUser.email);
					const providerUser =
						candidate.providerUser ??
						(await admin.createUserAndSendRecovery(email));
					if (candidate.providerUser) await admin.sendRecovery(email);
					await linkUser(
						pool,
						candidate.appUser.id,
						providerUser.id,
						candidate.providerUser ? "existing" : "created",
					);
					if (candidate.providerUser) summary.linked_existing += 1;
					else summary.created_with_recovery += 1;
				} catch {
					summary.failed += 1;
				}
			}
		}
		process.stdout.write(
			`${JSON.stringify({ mode: options.mode, cursor: candidates.at(-1)?.appUser.id ?? options.after ?? null, summary }, null, 2)}\n`,
		);
	} finally {
		await pool.end();
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		process.stderr.write(
			`${error instanceof Error ? error.message : "User migration failed."}\n`,
		);
		process.exitCode = 1;
	});
}
