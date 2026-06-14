import { Migrator, type Kysely, type Migration, type MigrationProvider, sql } from "kysely";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Database } from "./schema/types";

export const migrationsDirectory = new URL("./migrations", import.meta.url).pathname;

class SqlFileMigrationProvider implements MigrationProvider {
  constructor(private readonly migrationFolder: string) {}

  async getMigrations(): Promise<Record<string, Migration>> {
    const entries = await fs.readdir(this.migrationFolder);
    const migrations: Record<string, Migration> = {};

    for (const entry of entries.filter((name) => name.endsWith(".sql")).sort()) {
      const filePath = path.join(this.migrationFolder, entry);
      const source = await fs.readFile(filePath, "utf8");
      const name = entry.replace(/\.sql$/, "");

      migrations[name] = {
        async up(db) {
          await sql.raw(source).execute(db);
        },
      };
    }

    return migrations;
  }
}

export function createMigrator(db: Kysely<Database>, migrationFolder = migrationsDirectory) {
  return new Migrator({
    db,
    provider: new SqlFileMigrationProvider(migrationFolder),
  });
}

export async function migrateToLatest(db: Kysely<Database>, migrationFolder = migrationsDirectory) {
  const migrator = createMigrator(db, migrationFolder);
  const { error, results } = await migrator.migrateToLatest();

  if (error) {
    throw error;
  }

  return results ?? [];
}

export async function assertPostgresConnection(db: Kysely<Database>) {
  await sql`select 1`.execute(db);
}
