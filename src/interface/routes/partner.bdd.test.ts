import { beforeEach, describe, expect, it } from "vitest";
import { createRepositories } from "@/db/repositories";
import { resetInMemoryStore } from "@/db/repositories/inMemoryStore";
import type { ReviewRow, TourRequestRow } from "@/db/schema/types";
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

  it("rejects cross-facility partner page access without leaking private facility data", async () => {
    const client = createHttpTestClient();
    const session = await partnerSession(client);

    const response = await client.post(
      "/api/v1/partner/get_facility_manager_dashboard",
      { facility_id: "fac_orchid_gardens" },
      { cookie: session.cookie },
    );
    const bodyText = await response.text();

    expect(response.status).toBe(404);
    expect(JSON.parse(bodyText).error.code).toBe("facility_not_found");
    expect(bodyText).not.toContain("provider_contact_email");
    expect(bodyText).not.toContain("admin_notes");
    expect(bodyText).not.toContain("moderation_state");
  });

  it("serves representative partner dashboard, tour, review, analytics, and audit reads", async () => {
    const store = resetInMemoryStore();
    store.tourRequests.push(
      tourRequest("tour_route_pending", "fac_partner_managed", "pending_review", 1),
      tourRequest("tour_route_confirmed", "fac_partner_managed", "confirmed", 2),
      tourRequest("tour_route_other", "fac_orchid_gardens", "pending_review", 3),
    );
    store.reviews.push(
      review("rev_route_managed", "fac_partner_managed", 5, "2026-07-01"),
      review("rev_route_hidden", "fac_partner_managed", 2, "2026-07-02", "hidden"),
    );
    store.auditEvents.push(
      auditEvent("aud_route_listing", "facility", "fac_partner_managed", "listing_update", 1),
      auditEvent("aud_route_other", "facility", "fac_orchid_gardens", "listing_update", 2),
    );
    const client = createHttpTestClient();
    const session = await partnerSession(client);

    const dashboard = await client.post(
      "/api/v1/partner/get_facility_manager_dashboard",
      { facility_id: "fac_partner_managed" },
      { cookie: session.cookie },
    );
    const dashboardBody = await dashboard.json() as any;
    expect(dashboard.status).toBe(200);
    expect(dashboardBody.data).toMatchObject({
      facility: { id: "fac_partner_managed", name: "Partner Managed Home" },
      permissions: {
        can_edit_listing: true,
        can_manage_tours: true,
        can_respond_to_reviews: true,
      },
      editable_fields: { tagline: expect.any(String) },
      locked_fields: { name: "Partner Managed Home" },
      availability: { status: "available", beds_available: 3 },
      tour_availability: { status: "available", timezone: "Asia/Singapore" },
      tour_summary: { pending_review: 1, confirmed: 1 },
      reference_data: { features: expect.any(Array), languages: expect.any(Array) },
    });
    expect(dashboardBody.data.recent_tour_requests.map((row: any) => row.id)).toEqual([
      "tour_route_confirmed",
      "tour_route_pending",
    ]);
    expect(dashboardBody.data.recent_edits.map((row: any) => row.id)).toEqual([
      "aud_route_listing",
    ]);

    const tours = await client.post(
      "/api/v1/partner/list_facility_tour_requests",
      {
        facility_id: "fac_partner_managed",
        statuses: ["pending_review"],
        page: { type: "offset", limit: 10, offset: 0 },
      },
      { cookie: session.cookie },
    );
    const toursBody = await tours.json() as any;
    expect(tours.status).toBe(200);
    expect(toursBody.data.map((row: any) => row.id)).toEqual(["tour_route_pending"]);
    expect(toursBody.page.total_count).toBe(1);

    const reviews = await client.post(
      "/api/v1/partner/list_facility_reviews",
      {
        facility_id: "fac_partner_managed",
        statuses: ["published"],
        page: { type: "offset", limit: 10, offset: 0 },
      },
      { cookie: session.cookie },
    );
    const reviewsBody = await reviews.json() as any;
    expect(reviews.status).toBe(200);
    expect(reviewsBody.data.map((row: any) => row.id)).toEqual(["rev_route_managed"]);

    const analytics = await client.post(
      "/api/v1/partner/get_facility_analytics",
      {
        facility_id: "fac_partner_managed",
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-07-09T00:00:00.000Z",
      },
      { cookie: session.cookie },
    );
    await expect(analytics.json()).resolves.toMatchObject({
      data: {
        facility_id: "fac_partner_managed",
        metrics: {
          review_count: 1,
          average_rating: 5,
          pending_tour_requests: 1,
          confirmed_tour_requests: 1,
        },
      },
    });

    const audit = await client.post(
      "/api/v1/partner/list_facility_audit_events",
      {
        facility_id: "fac_partner_managed",
        actions: ["listing_update"],
        page: { type: "offset", limit: 10, offset: 0 },
      },
      { cookie: session.cookie },
    );
    const auditBody = await audit.json() as any;
    expect(audit.status).toBe(200);
    expect(auditBody.data.map((row: any) => row.id)).toEqual(["aud_route_listing"]);
  });

  it("allows representative listing and availability edit mutations with partner CSRF", async () => {
    const store = resetInMemoryStore();
    const client = createHttpTestClient();
    const session = await partnerSession(client);

    const listing = await client.post(
      "/api/v1/partner/update_facility_manager_listing_fields",
      {
        facility_id: "fac_partner_managed",
        expected_version: 1,
        patch: {
          tagline: "A route-level partner update",
          highlights: ["Fast route tests", "Clean interface slice"],
        },
      },
      { cookie: session.cookie, "x-csrf-token": session.csrf },
    );
    const listingBody = await listing.json() as any;
    expect(listing.status).toBe(200);
    expect(listingBody.data).toMatchObject({
      facility: { id: "fac_partner_managed", version: 2 },
      editable_fields: {
        tagline: "A route-level partner update",
        highlights: ["Fast route tests", "Clean interface slice"],
      },
    });

    const availability = await client.post(
      "/api/v1/partner/update_facility_availability",
      {
        facility_id: "fac_partner_managed",
        expected_version: 2,
        availability: {
          status: "full",
          beds_available: 10,
          note: "  ",
        },
      },
      { cookie: session.cookie, "x-csrf-token": session.csrf },
    );
    const availabilityBody = await availability.json() as any;
    expect(availability.status).toBe(200);
    expect(availabilityBody.data.availability).toMatchObject({
      status: "full",
      beds_available: null,
      note: null,
      updated_at: expect.any(String),
    });
    expect(store.facilities.find((row) => row.id === "fac_partner_managed")).toMatchObject({
      tagline: "A route-level partner update",
      availability_status: "full",
      beds_available: null,
      version: 3,
    });
    expect(store.auditEvents).toHaveLength(5);
    expect(new Set(store.auditEvents.map((event) => event.resource_id))).toEqual(
      new Set(["fac_partner_managed"]),
    );
  });

  it("enforces partner CSRF and route idempotency for tour workflow mutations", async () => {
    const store = resetInMemoryStore();
    store.tourRequests.push(
      tourRequest("tour_route_idempotent", "fac_partner_managed", "pending_review"),
    );
    const client = createHttpTestClient();
    const session = await partnerSession(client);
    const requestBody = {
      facility_id: "fac_partner_managed",
      tour_request_id: "tour_route_idempotent",
      expected_version: 1,
      scheduled_date: "2026-07-09",
      scheduled_time: "10:00",
      message: "See you then.",
    };

    const missingCsrf = await client.post(
      "/api/v1/partner/create_tour_request_confirmation",
      requestBody,
      { cookie: session.cookie, "Idempotency-Key": "idem_route_tour" },
    );
    expect(missingCsrf.status).toBe(403);
    expect(store.tourRequests[0]!.status).toBe("pending_review");

    const headers = {
      cookie: session.cookie,
      "x-csrf-token": session.csrf,
      "Idempotency-Key": "idem_route_tour",
    };
    const first = await client.post(
      "/api/v1/partner/create_tour_request_confirmation",
      requestBody,
      headers,
    );
    const replay = await client.post(
      "/api/v1/partner/create_tour_request_confirmation",
      requestBody,
      headers,
    );
    const firstBody = await first.json() as any;
    const replayBody = await replay.json() as any;

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(firstBody).toEqual(replayBody);
    expect(firstBody.data).toMatchObject({
      id: "tour_route_idempotent",
      status: "confirmed",
      version: 2,
      scheduled_date: "2026-07-09",
      scheduled_time: "10:00",
      partner_message: "See you then.",
    });
    expect(store.tourRequests[0]).toMatchObject({
      status: "confirmed",
      scheduled_date: "2026-07-09",
      scheduled_time: "10:00",
      partner_message: "See you then.",
    });
    expect(store.auditEvents).toHaveLength(1);
    expect(store.outboxEvents).toHaveLength(1);
    expect(store.idempotencyKeys).toHaveLength(1);
  });

  it("supports review response and review flag mutations through partner routes", async () => {
    const store = resetInMemoryStore();
    store.reviews.push(review("rev_route_workflow", "fac_partner_managed", 4, "2026-07-02"));
    const client = createHttpTestClient();
    const session = await partnerSession(client);

    const response = await client.post(
      "/api/v1/partner/create_facility_review_response",
      {
        facility_id: "fac_partner_managed",
        review_id: "rev_route_workflow",
        body: "Thank you for taking the time to visit.",
      },
      {
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "Idempotency-Key": "idem_route_review_response",
      },
    );
    const responseBody = await response.json() as any;
    expect(response.status).toBe(200);
    expect(responseBody.data).toMatchObject({
      id: "rev_route_workflow",
      response: {
        review_id: "rev_route_workflow",
        body: "Thank you for taking the time to visit.",
        status: "published",
        version: 1,
      },
    });

    const flag = await client.post(
      "/api/v1/partner/create_review_flag",
      {
        facility_id: "fac_partner_managed",
        review_id: "rev_route_workflow",
        reason: "inaccurate_info",
        details: "The activity schedule mentioned is outdated.",
      },
      {
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "Idempotency-Key": "idem_route_review_flag",
      },
    );
    const flagBody = await flag.json() as any;
    expect(flag.status).toBe(200);
    expect(flagBody.data).toMatchObject({
      review_id: "rev_route_workflow",
      facility_id: "fac_partner_managed",
      reason: "inaccurate_info",
      status: "pending",
    });
    expect(store.reviewResponses).toHaveLength(1);
    expect(store.reviewFlags).toHaveLength(1);
    expect(store.reviews.find((row) => row.id === "rev_route_workflow")).toMatchObject({
      status: "published",
    });
    expect(store.outboxEvents.map((event) => event.event_type)).toEqual([
      "review_response.created",
      "review_flag.created",
    ]);
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

async function partnerSession(client: ReturnType<typeof createHttpTestClient>) {
  const login = await partnerLogin(client);
  const csrf = cookieValue(login.setCookie, "gy_partner_session_csrf");
  return {
    ...login,
    csrf,
    cookie: cookieHeader(login.setCookie, ["gy_partner_session", "gy_partner_session_csrf"]),
  };
}

function cookieHeader(setCookie: string, names: string[]) {
  return names.map((name) => `${name}=${cookieValue(setCookie, name)}`).join("; ");
}

function cookieValue(setCookie: string, name: string) {
  return setCookie.match(new RegExp(`${name}=([^;]+)`))?.[1] ?? "";
}

function tourRequest(
  id: string,
  facilityId: string,
  status: TourRequestRow["status"],
  dayOffset = 0,
): TourRequestRow {
  const createdAt = new Date(Date.UTC(2026, 6, 5 + dayOffset, 2));
  return {
    id,
    user_id: "usr_family_demo",
    facility_id: facilityId,
    status,
    contact_name: "Family Demo",
    contact_phone: "+65 6000 0000",
    contact_email: "family@example.com",
    preferred_date: "2026-07-09",
    preferred_time: "10:00",
    care_notes: null,
    scheduled_date: null,
    scheduled_time: null,
    partner_message: null,
    version: 1,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function review(
  id: string,
  facilityId: string,
  rating: number,
  reviewDate: string,
  status: ReviewRow["status"] = "published",
): ReviewRow {
  const now = new Date("2026-07-05T02:00:00.000Z");
  return {
    id,
    facility_id: facilityId,
    author_name: "Family Reviewer",
    relationship: "Daughter",
    rating,
    title: "Helpful team",
    body: "The partner route team answered our questions clearly.",
    review_date: reviewDate,
    verified: true,
    status,
    version: 1,
    created_at: now,
    updated_at: now,
  };
}

function auditEvent(
  id: string,
  resourceType: string,
  resourceId: string,
  action: string,
  dayOffset: number,
) {
  return {
    id,
    actor_user_id: "usr_partner_operator",
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    metadata: {},
    created_at: new Date(Date.UTC(2026, 6, 5 + dayOffset, 2)),
  };
}
