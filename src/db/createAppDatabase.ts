import type { Kysely } from "kysely";
import type { Env } from "@/config/env";
import { createKyselyDb } from "@/db/kysely";
import type { Database } from "@/db/schema/types";
import { createAsyncInMemoryRepositories } from "@/db/repositories/asyncInMemoryRepositories";
import { createKyselyRepositories } from "@/db/repositories/kyselyRepositories";
import type { Repositories } from "@/db/repositories/ports";

export interface AppDatabaseScope {
  repos: Repositories;
  close: () => Promise<void>;
}

export function openAppDatabase(env: Env): AppDatabaseScope {
  if (env.HYPERDRIVE?.connectionString) {
    const db = createKyselyDb(env);
    return {
      repos: createKyselyRepositories(db),
      close: () => db.destroy(),
    };
  }

  return {
    repos: createAsyncInMemoryRepositories(),
    close: async () => {},
  };
}

export type AppDb = Kysely<Database>;
