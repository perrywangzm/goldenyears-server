import { createRoute, z } from "@hono/zod-openapi";
import { createAuthServices } from "@/application/auth/createAuthServices";
import type { AppBindings } from "@/config/env";
import type { AppOpenAPI } from "@/interface/app";
import {
  dataEnvelope,
  dataEnvelopeSchema,
  EmptyJsonBodySchema,
  ErrorEnvelopeSchema,
} from "@/shared/envelopes/envelope";
import { requireSessionAudience } from "@/shared/authz/policies";

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

const routeConfig = {
  method: "post" as const,
  tags: ["user"],
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
};

export function registerMeRoute(app: AppOpenAPI) {
  const handler = async (c: Parameters<Parameters<AppOpenAPI["openapi"]>[1]>[0], requireUser: boolean) => {
    const actor = c.get("actor");
    const context = { requestId: c.get("requestId"), actor, now: new Date() };
    if (requireUser) requireSessionAudience(context, "user");
    const service = createAuthServices(c.env, c.get("repos"), c.get("supabaseAuth")).sessions;
    return c.json(
      dataEnvelope(await service.getMe(context)),
      200,
    );
  };
  app.openapi(
    createRoute({ ...routeConfig, path: "/api/v1/user/get_me", operationId: "user_get_me" }),
    async (c) => handler(c, true),
  );
  app.openapi(
    createRoute({ ...routeConfig, path: "/api/v1/get_me", operationId: "get_me" }),
    async (c) => handler(c, false),
  );
}
