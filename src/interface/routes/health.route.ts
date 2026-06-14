import { createRoute, z } from "@hono/zod-openapi";
import type { AppOpenAPI } from "@/interface/app";
import {
  dataEnvelope,
  dataEnvelopeSchema,
  EmptyJsonBodySchema,
  ErrorEnvelopeSchema,
} from "@/shared/envelopes/envelope";

const HealthDataSchema = z
  .object({
    status: z.literal("ok"),
    service: z.literal("golden-years-api"),
  })
  .openapi("HealthData");

const route = createRoute({
  method: "post",
  path: "/api/v1/get_health",
  operationId: "get_health",
  tags: ["system"],
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
      description: "Worker health status.",
      content: {
        "application/json": {
          schema: dataEnvelopeSchema(HealthDataSchema, "GetHealthResponse"),
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

export function registerHealthRoute(app: AppOpenAPI) {
  app.openapi(route, (c) =>
    c.json(dataEnvelope({ status: "ok" as const, service: "golden-years-api" as const }), 200),
  );
}
