import { redactSensitive } from "./redaction";
import type { RequestContext } from "@/shared/request-context/context";

export interface LogRecord {
  level: "info" | "warn" | "error";
  message: string;
  meta: Record<string, unknown>;
}

export function serializeLogMeta(meta: Record<string, unknown> = {}) {
  return redactSensitive(meta) as Record<string, unknown>;
}

export function requestContextLogMeta(ctx: RequestContext) {
  return serializeLogMeta({
    request_id: ctx.requestId,
    actor_kind: ctx.actor.kind,
    actor_user_id: ctx.actor.userId,
    roles: ctx.actor.roles,
    source: ctx.source,
    ip_hash: ctx.ipHash,
    user_agent: ctx.userAgent,
  });
}

export const logger = {
  info(message: string, meta: Record<string, unknown> = {}) {
    console.info(message, serializeLogMeta(meta));
  },
  warn(message: string, meta: Record<string, unknown> = {}) {
    console.warn(message, serializeLogMeta(meta));
  },
  error(message: string, meta: Record<string, unknown> = {}) {
    console.error(message, serializeLogMeta(meta));
  },
};
