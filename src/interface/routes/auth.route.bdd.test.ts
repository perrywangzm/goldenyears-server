import { beforeEach, describe, expect, it } from "vitest";
import { createRepositories } from "@/db/repositories";
import { resetInMemoryStore } from "@/db/repositories/inMemoryStore";
import { createHttpTestClient } from "@/shared/testing/httpTestClient";

describe("Account creation and recovery routes", () => {
  beforeEach(() => {
    resetInMemoryStore();
  });

  it("supabase-contract:signup-does-not-link-unverified-profile", async () => {
    const client = createHttpTestClient();

    const signup = await client.post("/api/v1/user/auth/signup", {
      email: "new-family@example.com",
      password: "a-strong-password",
      display_name: "New Family",
    });

    expect(signup.status).toBe(200);
    const body = (await signup.json()) as any;
    expect(body.data).toMatchObject({
      user: null,
      email: "new-family@example.com",
      email_verification_required: true,
    });

    const store = createRepositories().store;
    const created = store.users.find((user) => user.email === "new-family@example.com");
    expect(created).toBeUndefined();
  });

  it("rejects signup when the email is already registered", async () => {
    const client = createHttpTestClient();

    const signup = await client.post("/api/v1/user/auth/signup", {
      email: "family@example.com",
      password: "a-strong-password",
    });

    expect(signup.status).toBe(409);
    await expect(signup.json()).resolves.toMatchObject({ error: { code: "conflict" } });
  });

  it("supabase-contract:recovery-ack-does-not-enumerate-account", async () => {
    const client = createHttpTestClient();

    const [known, unknown] = await Promise.all([
      client.post("/api/v1/user/auth/request_password_reset", { email: "family@example.com" }),
      client.post("/api/v1/user/auth/request_password_reset", { email: "unknown@example.com" }),
    ]);

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    await expect(known.json()).resolves.toMatchObject({ data: { email: "family@example.com" } });
    await expect(unknown.json()).resolves.toMatchObject({ data: { email: "unknown@example.com" } });
  });

  it("supabase-contract:resend-ack-does-not-enumerate-account", async () => {
    const client = createHttpTestClient();

    const response = await client.post("/api/v1/user/auth/resend_verification", {
      email: "unknown@example.com",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { email: "unknown@example.com" } });
  });

  it("does not require a CSRF token for signup or account-recovery endpoints", async () => {
    const client = createHttpTestClient();

    const responses = await Promise.all([
      client.post("/api/v1/user/auth/signup", { email: "csrf-exempt@example.com", password: "a-strong-password" }),
      client.post("/api/v1/user/auth/confirm_verification", { email: "csrf-exempt@example.com", token: "123456" }),
      client.post("/api/v1/user/auth/request_password_reset", { email: "family@example.com" }),
      client.post("/api/v1/user/auth/resend_verification", { email: "family@example.com" }),
    ]);

    for (const response of responses) {
      expect(response.status).not.toBe(403);
    }
  });
});
