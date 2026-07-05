import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createKyselyDb } from "../../src/db/kysely";
import {
	importMockupData,
	type MockupFixtures,
} from "../../src/db/seeds/importMockupData";

const here = path.dirname(fileURLToPath(import.meta.url));
export const mockupDataDir =
	process.env.MOCKUP_DATA_DIR ??
	path.resolve(here, "../../../golden-years-mockup/data");

async function readJson<T>(fileName: string): Promise<T> {
	const source = await readFile(path.join(mockupDataDir, fileName), "utf8");
	return JSON.parse(source) as T;
}

export async function loadMockupFixtures(): Promise<MockupFixtures> {
	const [facilities, reviews, careTypes, features, languages, regions] =
		await Promise.all([
			readJson<MockupFixtures["facilities"]>("facilities.json"),
			readJson<MockupFixtures["reviews"]>("reviews.json"),
			readJson<MockupFixtures["careTypes"]>("care-types.json"),
			readJson<MockupFixtures["features"]>("features.json"),
			readJson<MockupFixtures["languages"]>("languages.json"),
			readJson<MockupFixtures["regions"]>("regions.json"),
		]);

	return { facilities, reviews, careTypes, features, languages, regions };
}

async function main() {
	const connectionString =
		process.env.DATABASE_URL ?? process.env.HYPERDRIVE_CONNECTION_STRING;

	if (!connectionString) {
		throw new Error(
			"DATABASE_URL or HYPERDRIVE_CONNECTION_STRING is required to seed Postgres.",
		);
	}

	const db = createKyselyDb({ HYPERDRIVE: { connectionString } });

	try {
		const imported = await importMockupData(db, await loadMockupFixtures());
		console.log(
			`Imported ${imported.facilities.length} facilities, ${imported.reviews.length} reviews, and ${imported.referenceItems.length} reference items.`,
		);
	} finally {
		await db.destroy();
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	await main();
}
