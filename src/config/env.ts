export interface HyperdriveBinding {
  connectionString: string;
}

export interface Env {
  HYPERDRIVE?: HyperdriveBinding;
  CORS_ORIGIN?: string;
  SESSION_COOKIE_NAME?: string;
  /** When set (deployed Workers), requests must send matching `X-Api-Access-Key`. Omit locally. */
  API_ACCESS_KEY?: string;
}

export type AppBindings = {
  Bindings: Env;
  Variables: {
    requestId: string;
    actor: import("@/shared/request-context/context").ActorContext;
    repos: import("@/db/repositories/ports").Repositories;
  };
};
