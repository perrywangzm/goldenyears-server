import { createRoute, z } from "@hono/zod-openapi";
import { toSafeUser } from "@/application/auth/sessionService";
import type { AppOpenAPI } from "@/interface/app";
import { requirePlatformRole, requireSessionAudience } from "@/shared/authz/policies";
import { dataEnvelope, dataEnvelopeSchema, EmptyJsonBodySchema, ErrorEnvelopeSchema } from "@/shared/envelopes/envelope";
import { ApiError } from "@/shared/errors/apiError";

const AdminMeSchema = z
  .object({
    user: z.object({ id: z.string(), email: z.string(), display_name: z.string() }).strict(),
    roles: z.array(z.enum(["admin", "moderator", "cms_editor"])),
  })
  .strict()
  .openapi("AdminMeData");

export function registerAdminRoutes(app: AppOpenAPI) {
  app.openapi(
    createRoute({
      method: "post",
      path: "/api/v1/admin/get_me",
      operationId: "admin_get_me",
      tags: ["admin"],
      request: { body: jsonBody(EmptyJsonBodySchema) },
      responses: {
        200: {
          description: "Authenticated platform administrator.",
          content: { "application/json": { schema: dataEnvelopeSchema(AdminMeSchema, "AdminGetMeResponse") } },
        },
        401: errorResponse("Unauthenticated."),
        403: errorResponse("Forbidden."),
      },
    }),
    async (c) => {
      const ctx = { requestId: c.get("requestId"), actor: c.get("actor"), now: new Date() };
      const userId = requireSessionAudience(ctx, "admin");
      requirePlatformRole(ctx, "admin");
      const user = await c.get("repos").users.findById(userId);
      if (!user) throw new ApiError("session_not_found", "Session user was not found.", 401);
      const roles = ctx.actor.roles.filter(
        (role): role is "admin" | "moderator" | "cms_editor" => role !== "anonymous",
      );
      return c.json(dataEnvelope({ user: toSafeUser(user), roles }), 200);
    },
  );
}

function jsonBody(schema: z.ZodTypeAny) {
  return { required: true, content: { "application/json": { schema } } };
}

function errorResponse(description: string) {
  return { description, content: { "application/json": { schema: ErrorEnvelopeSchema } } };
}
