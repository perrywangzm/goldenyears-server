import { createRoute } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import { createApiApp } from "@/interface/app";
import { checkApiConventions } from "../../tools/contract-checks/checkApiConventions";
import { createHttpTestClient } from "@/shared/testing/httpTestClient";
import { EmptyJsonBodySchema, ErrorEnvelopeSchema } from "@/shared/envelopes/envelope";

describe("Feature: API access key gate", () => {
  it("Scenario: Local dev without API_ACCESS_KEY does not require X-Api-Access-Key", async () => {
    const client = createHttpTestClient();

    const response = await client.post("/api/v1/get_health", {});

    expect(response.status).toBe(200);
  });

  it("Scenario: Deployed Worker fails generically without a matching API access key", async () => {
    const client = createHttpTestClient({ API_ACCESS_KEY: "unlock.database.plz" });

    const response = await client.post("/api/v1/get_health", {});
    const body = (await response.json()) as { error: { code: string; message: string } };

    expect(response.status).toBe(500);
    expect(body.error).toMatchObject({
      code: "internal_error",
      message: "An unexpected error occurred.",
    });
    expect(JSON.stringify(body)).not.toContain("API");
  });

  it("Scenario: Deployed Worker fails generically with an incorrect API access key", async () => {
    const client = createHttpTestClient({ API_ACCESS_KEY: "unlock.database.plz" });

    const response = await client.post("/api/v1/get_health", {}, { "X-Api-Access-Key": "wrong" });
    const body = (await response.json()) as { error: { code: string; message: string } };

    expect(response.status).toBe(500);
    expect(body.error).toMatchObject({
      code: "internal_error",
      message: "An unexpected error occurred.",
    });
    expect(JSON.stringify(body)).not.toContain("API");
  });

  it("Scenario: Deployed Worker accepts requests with a matching staging access cookie", async () => {
    const client = createHttpTestClient({ API_ACCESS_KEY: "unlock.database.plz" });

    const response = await client.post(
      "/api/v1/get_health",
      {},
      { Cookie: "gy_staging_access=unlock.database.plz" },
    );

    expect(response.status).toBe(200);
  });

  it("Scenario: Deployed Worker accepts requests with a matching API access key", async () => {
    const client = createHttpTestClient({ API_ACCESS_KEY: "unlock.database.plz" });

    const response = await client.post(
      "/api/v1/get_health",
      {},
      { "X-Api-Access-Key": "unlock.database.plz" },
    );

    expect(response.status).toBe(200);
  });
});

describe("Feature: API transport conventions", () => {
  it("Scenario: A valid POST JSON request receives a data envelope", async () => {
    const client = createHttpTestClient();

    const response = await client.post("/api/v1/get_health", {});
    const body = (await response.json()) as { data: { status: string; service: string } };

    expect(response.status).toBe(200);
    expect(body).toHaveProperty("data");
    expect(body.data).toMatchObject({ status: "ok", service: "golden-years-api" });
    expect(response.headers.get("X-Request-Id")).toEqual(expect.any(String));
  });

  it("Scenario: Canonical surface routes are available alongside flat compatibility aliases", async () => {
    const client = createHttpTestClient();
    const canonical = await client.post("/api/v1/public/get_health", {});
    const compatibility = await client.post("/api/v1/get_health", {});

    expect(canonical.status).toBe(200);
    expect(compatibility.status).toBe(200);
  });

  it("Scenario: Legacy flat auth routes remain temporary compatibility aliases", async () => {
    const client = createHttpTestClient();
    const login = await client.post("/api/v1/create_session", {
      email: "family@example.com",
      password: "password",
    });
    const setCookie = login.headers.get("set-cookie") ?? "";
    const session = setCookie.match(/gy_user_session=([^;]+)/)?.[1] ?? "";
    const csrf = setCookie.match(/gy_user_session_csrf=([^;]+)/)?.[1] ?? "";
    const logout = await client.post(
      "/api/v1/delete_session",
      {},
      {
        cookie: `gy_user_session=${session}; gy_user_session_csrf=${csrf}`,
        "x-csrf-token": csrf,
      },
    );

    expect(login.status).toBe(200);
    expect(logout.status).toBe(200);
  });

  it("Scenario: CORS preflight permits the CSRF request header", async () => {
    const response = await createApiApp().fetch(
      new Request("https://api.test/api/v1/partner/auth/logout", {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:5173",
          "access-control-request-method": "POST",
          "access-control-request-headers": "x-csrf-token,content-type",
        },
      }),
      { CORS_ORIGIN: "http://localhost:5173" },
      {} as ExecutionContext,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("x-csrf-token");
  });

  it("Scenario: Non-POST requests are rejected consistently", async () => {
    const client = createHttpTestClient();

    const response = await client.get("/api/v1/get_health");
    const body = (await response.json()) as { error: { code: string } };

    expect([400, 405]).toContain(response.status);
    expect(body).toMatchObject({ error: { code: "bad_request" } });
  });
});

describe("Feature: OpenAPI convention checks", () => {
  it("Scenario: Generated OpenAPI operations follow Golden Years conventions", () => {
    expect(checkApiConventions()).toEqual([]);
  });
});

describe("Feature: Error normalization", () => {
  it("Scenario: Malformed JSON receives the standard bad_request envelope", async () => {
    const requestId = "bad-json-request-id";
    const response = await createApiApp().fetch(
      new Request("https://api.test/api/v1/search_facilities", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": requestId,
        },
        body: "not-json",
      }),
      {},
      {} as ExecutionContext,
    );
    const body = (await response.json()) as Record<string, any>;

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: {
        code: "bad_request",
        message: "Malformed JSON body.",
        details: { request_id: requestId },
      },
    });
  });

  it("Scenario: OpenAPI request validation receives the standard validation_failed envelope", async () => {
    const requestId = "schema-validation-request-id";
    const client = createHttpTestClient();

    const response = await client.post(
      "/api/v1/search_facilities",
      { page: { type: "offset", limit: 0, offset: 0 } },
      { "x-request-id": requestId },
    );
    const body = (await response.json()) as Record<string, any>;

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      error: {
        code: "validation_failed",
        message: "Request validation failed.",
        details: { request_id: requestId, issues: expect.any(Array) },
      },
    });
  });

  it("Scenario: Auth and user route body validation use the standard validation_failed envelope", async () => {
    const client = createHttpTestClient();

    const authResponse = await client.post("/api/v1/user/auth/login", {
      email: "not-an-email",
      password: "",
    });
    const authBody = (await authResponse.json()) as Record<string, any>;
    expect(authResponse.status).toBe(422);
    expect(authBody).toMatchObject({
      error: { code: "validation_failed", message: "Request validation failed." },
    });

    const familyResponse = await client.post("/api/v1/create_saved_facility", {});
    const familyBody = (await familyResponse.json()) as Record<string, any>;
    expect(familyResponse.status).toBe(422);
    expect(familyBody).toMatchObject({
      error: { code: "validation_failed", message: "Request validation failed." },
    });
  });

  it("Scenario: Unknown exceptions become safe internal errors", async () => {
    const app = createApiApp();
    const requestId = "test-request-id";
    const route = createRoute({
      method: "post",
      path: "/api/v1/throw_unknown",
      operationId: "throw_unknown",
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
        500: {
          description: "Internal error.",
          content: {
            "application/json": {
              schema: ErrorEnvelopeSchema,
            },
          },
        },
      },
    });
    app.openapi(route, () => {
      throw new Error("database password leaked in stack trace");
    });
    const response = await app.fetch(
      new Request("https://api.test/api/v1/throw_unknown", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": requestId,
        },
        body: "{}",
      }),
      {},
      {} as ExecutionContext,
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(500);
    expect(response.headers.get("X-Request-Id")).toBe(requestId);
    expect(body).toMatchObject({
      error: {
        code: "internal_error",
        message: "An unexpected error occurred.",
        details: { request_id: requestId },
      },
    });
    expect(JSON.stringify(body)).not.toContain("database password");
  });
});
