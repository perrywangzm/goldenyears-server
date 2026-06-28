import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRepositories } from "@/db/repositories";
import { resetInMemoryStore } from "@/db/repositories/inMemoryStore";
import { createHttpTestClient } from "@/shared/testing/httpTestClient";

async function json(response: Response) {
  return response.json() as Promise<any>;
}

const completeAnswers = {
  for_whom: "parent",
  daily_help: "247",
  cognitive: "none",
  medical: "skilled",
  urgency: "urgent",
  current_situation: "hospital",
  caregiver: "stretched",
};

describe("assessment APIs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T12:00:00.000Z"));
    resetInMemoryStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("get_assessment_schema returns presentation-safe quiz data without scoring metadata", async () => {
    const client = createHttpTestClient();
    const response = await client.post("/api/v1/get_assessment_schema", {});
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body.data.schema_version).toBe("assessment_v1");
    expect(body.data.title).toBe("What level of care do you actually need?");
    expect(body.data.questions).toHaveLength(7);
    expect(body.data.questions[0].options[0]).toEqual({
      id: "self",
      label: "Myself",
      emoji: "🌷",
    });
    expect(JSON.stringify(body)).not.toContain('"scores"');
    expect(JSON.stringify(body)).not.toContain('"override"');
  });

  it("create_assessment_result scores server-side and returns matches", async () => {
    const client = createHttpTestClient();
    const response = await client.post("/api/v1/create_assessment_result", {
      schema_version: "assessment_v1",
      answers: completeAnswers,
    });
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body.data.recommended_care_type).toBe("nursing");
    expect(body.data.decided_by).toBe("override");
    expect(body.data.because.length).toBeGreaterThan(0);
    expect(body.data.matches.length).toBeGreaterThan(0);
    expect(body.data.view_all_search.filters.care_type.eq).toBe("nursing");
    expect(response.headers.get("set-cookie")).toContain("gy_assessment_session=");
  });

  it("get_latest_assessment_result returns the saved anonymous result", async () => {
    const client = createHttpTestClient();
    const created = await client.post("/api/v1/create_assessment_result", {
      schema_version: "assessment_v1",
      answers: completeAnswers,
    });
    const cookie = created.headers.get("set-cookie") ?? "";
    const session = cookie.match(/gy_assessment_session=([^;]+)/)?.[1];
    expect(session).toBeTruthy();

    const latest = await client.post(
      "/api/v1/get_latest_assessment_result",
      {},
      { cookie: `gy_assessment_session=${session}` },
    );
    const body = await json(latest);

    expect(latest.status).toBe(200);
    expect(body.data?.recommended_care_type).toBe("nursing");
  });

  it("get_latest_assessment_result rejects cross-session access", async () => {
    const client = createHttpTestClient();
    const created = await client.post("/api/v1/create_assessment_result", {
      schema_version: "assessment_v1",
      answers: completeAnswers,
    });
    const createdBody = await json(created);
    const cookie = created.headers.get("set-cookie") ?? "";
    const session = cookie.match(/gy_assessment_session=([^;]+)/)?.[1];
    expect(session).toBeTruthy();

    const matches = await client.post(
      "/api/v1/list_assessment_matches",
      { id: createdBody.data.id },
      { cookie: "gy_assessment_session=someone-else" },
    );
    const body = await json(matches);

    expect(matches.status).toBe(403);
    expect(body.error.code).toBe("forbidden");
  });

  it("signed-in users can create and revisit their latest assessment without the anonymous cookie", async () => {
    const client = createHttpTestClient();
    const login = await client.post("/api/v1/create_session", {
      email: "family@example.com",
      password: "password",
    });
    const setCookie = login.headers.get("set-cookie") ?? "";
    const cookie = cookieHeader(setCookie);
    const csrfToken = cookieValue(setCookie, "gy_session_csrf");

    const created = await client.post(
      "/api/v1/create_assessment_result",
      { schema_version: "assessment_v1", answers: completeAnswers },
      { cookie, "x-csrf-token": csrfToken },
    );
    expect(created.status).toBe(200);

    const latest = await client.post("/api/v1/get_latest_assessment_result", {}, { cookie });
    const body = await json(latest);

    expect(latest.status).toBe(200);
    expect(body.data?.recommended_care_type).toBe("nursing");
  });

  it("delete_latest_assessment_result clears the saved latest result", async () => {
    const client = createHttpTestClient();
    const created = await client.post("/api/v1/create_assessment_result", {
      schema_version: "assessment_v1",
      answers: completeAnswers,
    });
    const cookie = created.headers.get("set-cookie") ?? "";
    const session = cookie.match(/gy_assessment_session=([^;]+)/)?.[1];

    const deleted = await client.post(
      "/api/v1/delete_latest_assessment_result",
      {},
      { cookie: `gy_assessment_session=${session}` },
    );
    expect(deleted.status).toBe(200);

    const latest = await client.post(
      "/api/v1/get_latest_assessment_result",
      {},
      { cookie: `gy_assessment_session=${session}` },
    );
    const body = await json(latest);

    expect(latest.status).toBe(200);
    expect(body.data).toBeNull();
  });

  it("create_session claims an anonymous assessment for the signed-in user", async () => {
    const client = createHttpTestClient();
    const created = await client.post("/api/v1/create_assessment_result", {
      schema_version: "assessment_v1",
      answers: completeAnswers,
    });
    const assessmentCookie = created.headers.get("set-cookie") ?? "";
    const session = assessmentCookie.match(/gy_assessment_session=([^;]+)/)?.[1];

    const login = await client.post(
      "/api/v1/create_session",
      { email: "family@example.com", password: "password" },
      { cookie: `gy_assessment_session=${session}` },
    );
    const authCookie = cookieHeader(login.headers.get("set-cookie") ?? "");

    const latest = await client.post("/api/v1/get_latest_assessment_result", {}, { cookie: authCookie });
    const body = await json(latest);

    expect(latest.status).toBe(200);
    expect(body.data?.recommended_care_type).toBe("nursing");
  });

  it("create_assessment_result excludes disabled facilities from matches", async () => {
    const store = createRepositories().store;
    const template = store.facilities.find((facility) => facility.id === "fac_bayshore_nursing");
    expect(template).toBeTruthy();
    store.facilities.push({
      ...template!,
      id: "fac_disabled_nursing",
      slug: "disabled-nursing",
      name: "Disabled Nursing Home",
      rating: 5,
      is_enabled: false,
    });

    const client = createHttpTestClient();
    const response = await client.post("/api/v1/create_assessment_result", {
      schema_version: "assessment_v1",
      answers: completeAnswers,
    });
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body.data.matches.map((match: { facility: { id: string } }) => match.facility.id)).not.toContain(
      "fac_disabled_nursing",
    );
  });

  it("create_assessment_result rejects unknown schema versions", async () => {
    const client = createHttpTestClient();
    const response = await client.post("/api/v1/create_assessment_result", {
      schema_version: "assessment_v99",
      answers: completeAnswers,
    });
    const body = await json(response);

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("validation_failed");
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
