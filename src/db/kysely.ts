import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Env } from "@/config/env";
import type { Database } from "./schema/types";

export function createKyselyDb(env: Env): Kysely<Database> {
  if (!env.HYPERDRIVE?.connectionString) {
    throw new Error("HYPERDRIVE connectionString is required for Postgres access.");
  }

  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: env.HYPERDRIVE.connectionString,
        max: 1,
      }),
    }),
  });
}
