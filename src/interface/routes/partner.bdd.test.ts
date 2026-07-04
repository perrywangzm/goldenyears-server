import { beforeEach, describe, expect, it } from "vitest";
import { createRepositories } from "@/db/repositories";
import { resetInMemoryStore } from "@/db/repositories/inMemoryStore";
import { sha256 } from "@/platform/crypto/passwordService";
import { createHttpTestClient } from "@/shared/testing/httpTestClient";

describe("partner API boundary", () => {
  beforeEach(() => resetInMemoryStore());

  it("supabase-contract:partner-membership-after-provider-identity", async () => {
    const client = createHttpTestClient();
    const response = await client.post("/api/v1/partner/auth/login", {
      email: "partner@example.com",
      password: "password",
    });
    const body = await response.json() as any;
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(body.data.session.audience).toBe("partner");
    expect(setCookie).toContain("gy_partner_session=");
    expect(setCookie).toContain("gy_partner_session_csrf=");
    expect(setCookie).not.toContain("Domain=");

    const rejected = await client.post("/api/v1/partner/auth/login", {
      email: "family@example.com",
      password: "password",
    });
    expect(rejected.status).toBe(403);
  });

  it("returns partner context and only facilities assigned through active company membership", async () => {
    const client = createHttpTestClient();
    const login = await partnerLogin(client);
    const cookie = cookieHeader(login.setCookie, ["gy_partner_session", "gy_partner_session_csrf"]);

    const me = await client.post("/api/v1/partner/get_me", {}, { cookie });
    const meBody = await me.json() as any;
    expect(me.status).toBe(200);
    expect(meBody.data).toMatchObject({
      user: { id: "usr_partner_operator", email: "partner@example.com" },
      companies: [{ id: "co_partner_demo", name: "Golden Care Partners", status: "active" }],
      managed_facility_count: 1,
      csrf: {
        cookie_name: "gy_partner_session_csrf",
        header_name: "X-CSRF-Token",
        token: cookieValue(login.setCookie, "gy_partner_session_csrf"),
      },
    });

    const facilities = await client.post(
      "/api/v1/partner/list_managed_facilities",
      { page: { type: "offset", limit: 20, offset: 0 } },
      { cookie },
    );
    const facilitiesBody = await facilities.json() as any;
    expect(facilities.status).toBe(200);
    expect(facilitiesBody.data).toEqual([
      expect.objectContaining({ id: "fac_partner_managed", company_id: "co_partner_demo" }),
    ]);
    expect(facilitiesBody.data.map((facility: any) => facility.id)).not.toContain("fac_orchid_gardens");
    expect(facilitiesBody.page.total_count).toBe(1);
  });

  it("supabase-contract:audience-cookies-remain-isolated", async () => {
    const client = createHttpTestClient();
    const userLogin = await client.post("/api/v1/user/auth/login", {
      email: "partner@example.com",
      password: "password",
    });
    const partner = await partnerLogin(client);
    const userSetCookie = userLogin.headers.get("set-cookie") ?? "";
    const userCookie = cookieHeader(userSetCookie, ["gy_user_session", "gy_user_session_csrf"]);
    const partnerCookie = cookieHeader(partner.setCookie, ["gy_partner_session", "gy_partner_session_csrf"]);
    const allCookies = `${userCookie}; ${partnerCookie}`;

    expect((await client.post("/api/v1/user/get_me", {}, { cookie: partnerCookie })).status).toBe(401);
    expect((await client.post("/api/v1/partner/get_me", {}, { cookie: userCookie })).status).toBe(401);
    expect((await client.post("/api/v1/admin/get_me", {}, { cookie: allCookies })).status).toBe(401);
    expect((await client.post("/api/v1/user/get_me", {}, { cookie: allCookies })).status).toBe(200);
    expect((await client.post("/api/v1/partner/get_me", {}, { cookie: allCookies })).status).toBe(200);

    const logout = await client.post(
      "/api/v1/partner/auth/logout",
      {},
      {
        cookie: allCookies,
        "x-csrf-token": cookieValue(partner.setCookie, "gy_partner_session_csrf"),
      },
    );
    expect(logout.status).toBe(200);
    expect((await client.post("/api/v1/user/get_me", {}, { cookie: allCookies })).status).toBe(200);
    expect((await client.post("/api/v1/partner/get_me", {}, { cookie: allCookies })).status).toBe(401);
  });

  it("uses real platform roles for the protected admin boundary", async () => {
    const token = "admin-session-token";
    createRepositories().sessions.create({
      id: "sess_admin",
      user_id: "usr_admin_demo",
      token_hash: await sha256(token),
      audience: "admin",
      expires_at: new Date("2099-01-01T00:00:00.000Z"),
      created_at: new Date("2026-06-28T00:00:00.000Z"),
      revoked_at: null,
    });

    const response = await createHttpTestClient().post(
      "/api/v1/admin/get_me",
      {},
      { cookie: `gy_admin_session=${token}` },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { user: { id: "usr_admin_demo" }, roles: ["admin"] },
    });

    const nonAdminToken = "non-admin-session-token";
    createRepositories().sessions.create({
      id: "sess_non_admin",
      user_id: "usr_partner_operator",
      token_hash: await sha256(nonAdminToken),
      audience: "admin",
      expires_at: new Date("2099-01-01T00:00:00.000Z"),
      created_at: new Date("2026-06-28T00:00:00.000Z"),
      revoked_at: null,
    });
    const forbidden = await createHttpTestClient().post(
      "/api/v1/admin/get_me",
      {},
      { cookie: `gy_admin_session=${nonAdminToken}` },
    );
    expect(forbidden.status).toBe(403);
  });

  it("removes partner access when either the company or membership is disabled", async () => {
    const store = resetInMemoryStore();
    const client = createHttpTestClient();
    const login = await partnerLogin(client);
    const cookie = cookieHeader(login.setCookie, ["gy_partner_session", "gy_partner_session_csrf"]);
    store.companies[0]!.status = "disabled";

    const me = await client.post("/api/v1/partner/get_me", {}, { cookie });
    const body = await me.json() as any;
    expect(me.status).toBe(200);
    expect(body.data.companies).toEqual([]);
    expect(body.data.managed_facility_count).toBe(0);
  });
});

async function partnerLogin(client: ReturnType<typeof createHttpTestClient>) {
  const response = await client.post("/api/v1/partner/auth/login", {
    email: "partner@example.com",
    password: "password",
  });
  expect(response.status).toBe(200);
  return { response, setCookie: response.headers.get("set-cookie") ?? "" };
}

function cookieHeader(setCookie: string, names: string[]) {
  return names.map((name) => `${name}=${cookieValue(setCookie, name)}`).join("; ");
}

function cookieValue(setCookie: string, name: string) {
  return setCookie.match(new RegExp(`${name}=([^;]+)`))?.[1] ?? "";
}
