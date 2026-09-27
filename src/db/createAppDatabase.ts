import type { Kysely } from "kysely";
import type { Env } from "@/config/env";
import { createKyselyDb } from "@/db/kysely";
import type { Database } from "@/db/schema/types";
import { createAsyncInMemoryRepositories } from "@/db/repositories/asyncInMemoryRepositories";
import {
	createInMemoryTransactionRunner,
	getInMemoryStore,
} from "@/db/repositories/inMemoryStore";
import { createKyselyRepositories } from "@/db/repositories/kyselyRepositories";
import type { Repositories } from "@/db/repositories/ports";
import { TransactionRunner } from "@/shared/transactions/transactionRunner";

export interface AppDatabaseScope {
  repos: Repositories;
  transactionRunner: TransactionRunner;
  close: () => Promise<void>;
}

export function openAppDatabase(env: Env): AppDatabaseScope {
  if (env.HYPERDRIVE?.connectionString) {
    const db = createKyselyDb(env);
    return {
      repos: createKyselyRepositories(db),
      transactionRunner: new TransactionRunner(),
      close: () => db.destroy(),
    };
  }

  const store = getInMemoryStore();
  return {
    repos: createAsyncInMemoryRepositories(store),
    transactionRunner: createInMemoryTransactionRunner(store),
    close: async () => {},
  };
}

export type AppDb = Kysely<Database>;
