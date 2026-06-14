import { promises as fs } from "node:fs";
import path from "node:path";
import { migrationsDirectory } from "@/db/migrate";
import { createSeededStore, type InMemoryStore } from "@/db/repositories/inMemoryStore";

export async function readMigrationSources(migrationFolder = migrationsDirectory) {
  const names = (await fs.readdir(migrationFolder)).filter((name) => name.endsWith(".sql")).sort();
  const sources = await Promise.all(
    names.map(async (name) => ({
      name,
      sql: await fs.readFile(path.join(migrationFolder, name), "utf8"),
    })),
  );

  return sources;
}

export async function readCombinedMigrationSql(migrationFolder = migrationsDirectory) {
  const migrations = await readMigrationSources(migrationFolder);
  return migrations.map((migration) => migration.sql).join("\n");
}

export function extractCreatedTables(sql: string) {
  return new Set(
    [...sql.matchAll(/create table if not exists\s+([a-z_]+)/gi)].map((match) => match[1].toLowerCase()),
  );
}

export function extractCreatedIndexes(sql: string) {
  return new Set(
    [...sql.matchAll(/create index if not exists\s+([a-z_]+)/gi)].map((match) => match[1].toLowerCase()),
  );
}

export class TestTransactionDatabase {
  readonly store: InMemoryStore;

  constructor(store: InMemoryStore = createSeededStore()) {
    this.store = store;
  }

  async transaction<T>(work: (store: InMemoryStore) => Promise<T> | T): Promise<T> {
    const snapshot = structuredClone(this.store);

    try {
      return await work(this.store);
    } catch (error) {
      Object.assign(this.store, snapshot);
      throw error;
    }
  }
}
