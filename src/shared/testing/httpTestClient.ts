import app from "@/entrypoints/http";
import type { Env } from "@/config/env";

export function createHttpTestClient(env: Env = {}) {
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
