export interface CacheRegistration {
  endpoint: string;
  scope: "tenant" | "user" | "public";
  ttl_seconds: number;
  swr_seconds?: number;
  depends_on: string[];
}

export interface MutationRegistration {
  endpoint: string;
  invalidates: string[];
}

export const cacheRegistrations: CacheRegistration[] = [];
export const mutationRegistrations: MutationRegistration[] = [];

export function registerCache(registration: CacheRegistration) {
  assertUnique(cacheRegistrations, registration.endpoint, "cache");
  cacheRegistrations.push(registration);
  return registration;
}

export function registerMutation(registration: MutationRegistration) {
  assertUnique(mutationRegistrations, registration.endpoint, "mutation");
  mutationRegistrations.push(registration);
  return registration;
}

export function getCacheOpenApiExtensions(endpoint: string): Record<string, unknown> {
  const cache = cacheRegistrations.find((registration) => registration.endpoint === endpoint);
  const mutation = mutationRegistrations.find((registration) => registration.endpoint === endpoint);
  return {
    ...(cache
      ? {
          "x-cache": {
            scope: cache.scope,
            ttl_seconds: cache.ttl_seconds,
            swr_seconds: cache.swr_seconds,
            depends_on: cache.depends_on,
          },
        }
      : {}),
    ...(mutation ? { "x-invalidates": mutation.invalidates } : {}),
  };
}

export function clearCacheRegistrationsForTests() {
  cacheRegistrations.length = 0;
  mutationRegistrations.length = 0;
}

function assertUnique<T extends { endpoint: string }>(registrations: T[], endpoint: string, kind: string) {
  if (registrations.some((registration) => registration.endpoint === endpoint)) {
    throw new Error(`Duplicate ${kind} registration for ${endpoint}.`);
  }
}
