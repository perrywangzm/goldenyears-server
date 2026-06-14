export interface TransactionPort<TTransaction = unknown> {
  transaction<T>(operation: (trx: TTransaction) => Promise<T> | T): Promise<T>;
}

export interface SnapshotTransactionStore {
  snapshot(): unknown;
  restore(snapshot: unknown): void;
}

export class TransactionRunner<TTransaction = unknown> {
  constructor(private readonly port?: TransactionPort<TTransaction>) {}

  async run<T>(operation: (trx: TTransaction) => Promise<T> | T): Promise<T> {
    if (this.port) {
      return this.port.transaction(operation);
    }
    return operation(undefined as TTransaction);
  }
}

export class InMemoryTransactionRunner<TStore extends SnapshotTransactionStore> extends TransactionRunner<TStore> {
  constructor(private readonly store: TStore) {
    super();
  }

  override async run<T>(operation: (trx: TStore) => Promise<T> | T): Promise<T> {
    const snapshot = this.store.snapshot();
    try {
      return await operation(this.store);
    } catch (error) {
      this.store.restore(snapshot);
      throw error;
    }
  }
}
