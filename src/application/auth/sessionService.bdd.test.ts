import { beforeEach, describe, expect, it } from "vitest";
import { TourRequestService } from "@/application/tours/tourRequestService";
import { createAsyncInMemoryRepositories, createRepositories } from "@/db/repositories";
import { resetInMemoryStore } from "@/db/repositories/inMemoryStore";
import { createHttpTestClient } from "@/shared/testing/httpTestClient";
import type { RequestContext } from "@/shared/request-context/context";

describe("Browser session authentication", () => {
  beforeEach(() => {
    resetInMemoryStore();
  });

  it("creates a secure session and get_me returns safe user context", async () => {
    const client = createHttpTestClient();

    const login = await client.post("/api/v1/create_session", {
      email: "family@example.com",
      password: "password",
    });

    expect(login.status).toBe(200);
    const setCookie = login.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("gy_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");

    const cookie = cookieHeader(setCookie);
    const me = await client.post("/api/v1/get_me", {}, { cookie });

    expect(me.status).toBe(200);
    await expect(me.json()).resolves.toMatchObject({
      data: {
        actor: { kind: "user", user_id: "usr_family_demo", roles: ["family"] },
        user: {
          id: "usr_family_demo",
          email: "family@example.com",
          display_name: "Family Demo",
        },
        roles: ["family"],
        counts: {
          saved_facilities: 0,
          unread_notifications: 0,
          managed_facilities: 0,
          review_invites: 0,
        },
      },
    });
  });
});

describe("Auth context integrity", () => {
  beforeEach(() => {
    resetInMemoryStore();
  });

  it("derives the actor from the session context instead of body identity fields", async () => {
    const repos = createAsyncInMemoryRepositories();
    const service = new TourRequestService(repos);
    const ctx: RequestContext = {
      requestId: "req_test",
      actor: {
        kind: "user",
        userId: "usr_family_demo",
        sessionId: "sess_test",
        roles: ["family"],
      },
      now: new Date("2026-05-18T00:00:00.000Z"),
    };

    await service.create(
      ctx,
      {
        facility_id: "fac_orchid_gardens",
        contact_name: "Family Demo",
        contact_phone: "+6500000000",
        contact_email: "family@example.com",
        preferred_date: "2026-06-01",
        preferred_time: "10:00",
        user_id: "usr_impersonated",
        actor_id: "usr_impersonated",
      } as never,
      null,
    );

    expect(createRepositories().store.tourRequests[0]?.user_id).toBe("usr_family_demo");
  });
});

describe("CSRF protection", () => {
  beforeEach(() => {
    resetInMemoryStore();
  });

  it("rejects cookie-authenticated mutations without a matching CSRF token", async () => {
    const client = createHttpTestClient();
    const login = await client.post("/api/v1/create_session", {
      email: "family@example.com",
      password: "password",
    });
    const cookie = cookieHeader(login.headers.get("set-cookie") ?? "");

    const logout = await client.post("/api/v1/delete_session", {}, { cookie });

    expect(logout.status).toBe(403);
    await expect(logout.json()).resolves.toMatchObject({
      error: { code: "forbidden" },
    });
    expect(createRepositories().store.sessions[0]?.revoked_at).toBeNull();
  });

  it("allows cookie-authenticated mutations with the double-submit CSRF token", async () => {
    const client = createHttpTestClient();
    const login = await client.post("/api/v1/create_session", {
      email: "family@example.com",
      password: "password",
    });
    const setCookie = login.headers.get("set-cookie") ?? "";
    const cookie = cookieHeader(setCookie);
    const csrfToken = cookieValue(setCookie, "gy_session_csrf");

    const logout = await client.post("/api/v1/delete_session", {}, { cookie, "x-csrf-token": csrfToken });

    expect(logout.status).toBe(200);
    expect(createRepositories().store.sessions[0]?.revoked_at).toBeInstanceOf(Date);
  });
});

function cookieHeader(setCookie: string) {
  return ["gy_session", "gy_session_csrf"]
    .map((name) => `${name}=${cookieValue(setCookie, name)}`)
    .join("; ");
}

function cookieValue(setCookie: string, name: string) {
  return setCookie.match(new RegExp(`${name}=([^;]+)`))?.[1] ?? "";
}
