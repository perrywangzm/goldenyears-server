import { canonicalJson } from "@/shared/cache/canonicalJson";
import { ApiError } from "@/shared/errors/apiError";

export interface IdempotencyRecord {
  key: string;
  user_id: string | null;
  request_hash: string;
  response_status: number;
  response_body: unknown;
  expires_at: Date;
  created_at: Date;
}

export interface IdempotencyStore {
  find(key: string, userId: string | null, now?: Date): Promise<IdempotencyRecord | undefined>;
  create(record: IdempotencyRecord): Promise<IdempotencyRecord>;
}

export interface IdempotencyRunInput<T> {
  key: string | null;
  userId: string | null;
  requestBody: unknown;
  execute: () => Promise<T>;
  now?: Date;
  retentionMs?: number;
  successStatus?: number;
}

export class IdempotencyService {
  constructor(private readonly idempotencyRepository: IdempotencyStore) {}

  async run<T>(input: IdempotencyRunInput<T>): Promise<{ replayed: boolean; result: T }> {
    if (!input.key) {
      return { replayed: false, result: await input.execute() };
    }

    const requestHash = await sha256(canonicalJson(input.requestBody));
    const now = input.now ?? new Date();
    const existing = await this.idempotencyRepository.find(input.key, input.userId, now);
    if (existing) {
      if (existing.request_hash !== requestHash) {
        throw new ApiError("conflict", "Idempotency-Key was reused with a different request.", 409);
      }
      if (existing.response_status >= 400) {
        throw existing.response_body instanceof ApiError
          ? existing.response_body
          : new ApiError("conflict", "The original request failed.", existing.response_status);
      }
      return { replayed: true, result: structuredClone(existing.response_body) as T };
    }

    try {
      const result = await input.execute();
      await this.idempotencyRepository.create({
        key: input.key,
        user_id: input.userId,
        request_hash: requestHash,
        response_status: input.successStatus ?? 200,
        response_body: structuredClone(result),
        expires_at: new Date(now.getTime() + (input.retentionMs ?? 24 * 60 * 60 * 1000)),
        created_at: now,
      });
      return { replayed: false, result };
    } catch (error) {
      if (error instanceof ApiError && error.status < 500) {
        await this.idempotencyRepository.create({
          key: input.key,
          user_id: input.userId,
          request_hash: requestHash,
          response_status: error.status,
          response_body: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
          expires_at: new Date(now.getTime() + (input.retentionMs ?? 24 * 60 * 60 * 1000)),
          created_at: now,
        });
      }
      throw error;
    }
  }
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
