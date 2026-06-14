import { createRoute, z } from "@hono/zod-openapi";
import { SessionService } from "@/application/auth/sessionService";
import type { AppOpenAPI } from "@/interface/app";
import {
  dataEnvelope,
  dataEnvelopeSchema,
  EmptyJsonBodySchema,
  ErrorEnvelopeSchema,
} from "@/shared/envelopes/envelope";

const ActorSchema = z
  .object({
    kind: z.enum(["anonymous", "user"]),
    user_id: z.string().nullable(),
    session_id: z.string().nullable(),
    roles: z.array(z.string()),
  })
  .openapi("CurrentActor");

const CurrentContextSchema = z
  .object({
    actor: z.unknown(),
    user: z.unknown().nullable(),
    roles: z.array(z.string()),
    counts: z.object({
      saved_facilities: z.number().int(),
      unread_notifications: z.number().int(),
      managed_facilities: z.number().int(),
      review_invites: z.number().int(),
    }),
  })
  .openapi("CurrentContextData");

const route = createRoute({
  method: "post",
  path: "/api/v1/get_me",
  operationId: "get_me",
  tags: ["current_context"],
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: EmptyJsonBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Current server-derived actor context.",
      content: {
        "application/json": {
          schema: dataEnvelopeSchema(CurrentContextSchema, "GetMeResponse"),
        },
      },
    },
    400: {
      description: "Bad request.",
      content: {
        "application/json": {
          schema: ErrorEnvelopeSchema,
        },
      },
    },
  },
});

export function registerMeRoute(app: AppOpenAPI) {
  app.openapi(route, async (c) => {
    const actor = c.get("actor");
    const service = new SessionService(c.get("repos"));
    return c.json(
      dataEnvelope(await service.getMe({ requestId: c.get("requestId"), actor, now: new Date() })),
      200,
    );
  });
}
