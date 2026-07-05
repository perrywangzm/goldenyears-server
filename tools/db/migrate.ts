import { pathToFileURL } from "node:url";
import { createKyselyDb } from "../../src/db/kysely";
import {
	assertPostgresConnection,
	migrateToLatest,
	migrationsDirectory,
} from "../../src/db/migrate";

export const migrationDirectory = migrationsDirectory;

export async function runDatabaseMigrations(
	connectionString = process.env.DATABASE_URL,
) {
	if (!connectionString) {
		throw new Error("DATABASE_URL is required to run database migrations.");
	}

	const db = createKyselyDb({ HYPERDRIVE: { connectionString } });
	try {
		await assertPostgresConnection(db);
		return await migrateToLatest(db, migrationDirectory);
	} finally {
		await db.destroy();
	}
}

async function main() {
	const results = await runDatabaseMigrations();
	const applied = results.filter(
		(result) => result.status === "Success",
	).length;
	console.log(
		applied === 0
			? "Database schema is already current."
			: `Applied ${applied} database migration(s).`,
	);
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	await main();
}
