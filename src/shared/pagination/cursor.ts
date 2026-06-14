import { ApiError } from "@/shared/errors/apiError";
import { canonicalJson } from "@/shared/cache/canonicalJson";

export function encodeCursor(payload: Record<string, unknown>) {
  return toBase64Url(JSON.stringify(payload));
}

export function decodeCursor(cursor: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(fromBase64Url(cursor));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Cursor payload must be an object.");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new ApiError("validation_failed", "Invalid cursor.", 422);
  }
}

export interface CursorRequestShape {
  filters?: unknown;
  sort?: unknown;
  fields?: unknown;
}

export interface CursorPayload {
  position: Record<string, unknown>;
  requestShape: CursorRequestShape;
}

export async function createCursor(input: CursorPayload): Promise<string> {
  return encodeCursor({
    v: 1,
    shape_hash: await shapeHash(input.requestShape),
    position: input.position,
  });
}

export async function readCursor(cursor: string, requestShape: CursorRequestShape): Promise<Record<string, unknown>> {
  const decoded = decodeCursor(cursor);
  if (decoded.v !== 1 || decoded.shape_hash !== (await shapeHash(requestShape))) {
    throw new ApiError("validation_failed", "Cursor does not match this request shape.", 422);
  }
  if (!decoded.position || typeof decoded.position !== "object" || Array.isArray(decoded.position)) {
    throw new ApiError("validation_failed", "Invalid cursor position.", 422);
  }
  return decoded.position as Record<string, unknown>;
}

async function shapeHash(requestShape: CursorRequestShape): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(requestShape)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toBase64Url(value: string): string {
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string): string {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}
