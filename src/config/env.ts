export interface HyperdriveBinding {
  connectionString: string;
}

export interface Env {
  HYPERDRIVE?: HyperdriveBinding;
  CORS_ORIGIN?: string;
  /** When set (deployed Workers), requests must send matching `X-Api-Access-Key`. Omit locally. */
  API_ACCESS_KEY?: string;
  /** Supabase project URL for server-side Auth API calls. Worker secret only. */
  SUPABASE_URL?: string;
  /** Supabase publishable key for ordinary server-side Auth API calls. Worker binding only. */
  SUPABASE_PUBLISHABLE_KEY?: string;
  /** Fixed allowlisted callback used by Supabase verification and recovery emails. */
  SUPABASE_AUTH_REDIRECT_URL?: string;
  /** Temporary cutover switch. Only verified identities may use email fallback linking. */
  SUPABASE_RUNTIME_EMAIL_LINKING?: string;
  /** Optional bounded timeout for Supabase Auth HTTP calls. */
  SUPABASE_AUTH_REQUEST_TIMEOUT_MS?: string;
}

export type AppBindings = {
  Bindings: Env;
  Variables: {
    requestId: string;
    actor: import("@/shared/request-context/context").ActorContext;
    repos: import("@/db/repositories/ports").Repositories;
    supabaseAuth?: import("@/platform/auth/supabaseAuthPort").SupabaseAuthPort;
  };
};
