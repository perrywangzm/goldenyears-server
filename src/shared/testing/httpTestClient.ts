import type { Env } from "@/config/env";
import { createApiApp } from "@/interface/app";
import type { SupabaseAuthPort } from "@/platform/auth/supabaseAuthPort";
import { FakeSupabaseAuthAdapter } from "@/shared/testing/fakeSupabaseAuthAdapter";

export function createHttpTestClient(env: Env = {}, supabaseAuth: SupabaseAuthPort = new FakeSupabaseAuthAdapter()) {
  const app = createApiApp({ supabaseAuth });
  return {
    async post(path: string, body: unknown = {}, headers: HeadersInit = {}) {
      return app.fetch(
        new Request(`https://api.test${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body: JSON.stringify(body),
        }),
        env,
        {} as ExecutionContext,
      );
    },
    async get(path: string) {
      return app.fetch(new Request(`https://api.test${path}`), env, {} as ExecutionContext);
    },
  };
}
