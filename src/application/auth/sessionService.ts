import { deleteCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import type { AppBindings } from "@/config/env";
import type { Repositories } from "@/db/repositories/ports";
import { AssessmentService, readAssessmentSessionCookie } from "@/application/assessment/assessmentService";
import { verifyPassword, sha256 } from "@/platform/crypto/passwordService";
import { ApiError } from "@/shared/errors/apiError";
import type { RequestContext } from "@/shared/request-context/context";

export class SessionService {
  constructor(private readonly repos: Repositories) {}

  async createSession(input: { email: string; password: string }, c: Context<AppBindings>) {
    const user = await this.repos.users.findByEmail(input.email);
    if (!user || user.status !== "active" || !(await verifyPassword(input.password, user.password_hash))) {
      throw new ApiError("unauthenticated", "Invalid email or password.", 401);
    }

    const token = crypto.randomUUID();
    const csrfToken = crypto.randomUUID();
    const session = await this.repos.sessions.create({
      id: `sess_${crypto.randomUUID()}`,
      user_id: user.id,
      token_hash: await sha256(token),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      created_at: new Date(),
      revoked_at: null,
    });

    const assessmentSessionId = readAssessmentSessionCookie(c.req.header("cookie"));
    if (assessmentSessionId) {
      await new AssessmentService(this.repos).claimAnonymousSession(user.id, session.id, assessmentSessionId);
    }

    setCookie(c, c.env?.SESSION_COOKIE_NAME ?? "gy_session", token, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    setCookie(c, csrfCookieName(c), csrfToken, {
      httpOnly: false,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });

    return {
      session: { id: session.id, expires_at: new Date(session.expires_at).toISOString() },
      user: toSafeUser(user),
      roles: await this.repos.users.rolesForUser(user.id),
      csrf_token: csrfToken,
    };
  }

  async deleteSession(ctx: RequestContext, c: Context<AppBindings>) {
    if (ctx.actor.sessionId) {
      await this.repos.sessions.revoke(ctx.actor.sessionId, ctx.now);
    }
    deleteCookie(c, c.env?.SESSION_COOKIE_NAME ?? "gy_session", { path: "/" });
    deleteCookie(c, csrfCookieName(c), { path: "/" });
    return { id: ctx.actor.sessionId ?? "anonymous" };
  }

  async getMe(ctx: RequestContext) {
    if (ctx.actor.kind !== "user" || !ctx.actor.userId) {
      return {
        actor: { kind: "anonymous", roles: ["anonymous"] },
        user: null,
        roles: ["anonymous"],
        counts: { saved_facilities: 0, unread_notifications: 0, managed_facilities: 0, review_invites: 0 },
      };
    }

    const user = await this.repos.users.findById(ctx.actor.userId);
    if (!user) {
      throw new ApiError("session_not_found", "Session user was not found.", 401);
    }

    const saved = await this.repos.savedFacilities.listForUser(user.id);
    return {
      actor: { kind: "user", user_id: user.id, roles: ctx.actor.roles },
      user: toSafeUser(user),
      roles: ctx.actor.roles,
      counts: {
        saved_facilities: saved.length,
        unread_notifications: 0,
        managed_facilities: managedFacilityCount(ctx),
        review_invites: 0,
      },
    };
  }
}

function toSafeUser(user: { id: string; email: string; display_name: string }) {
  return { id: user.id, email: user.email, display_name: user.display_name };
}

function csrfCookieName(c: Context<AppBindings>) {
  return `${c.env?.SESSION_COOKIE_NAME ?? "gy_session"}_csrf`;
}

function managedFacilityCount(ctx: RequestContext) {
  return ctx.actor.roles.includes("facility_manager") ? 0 : 0;
}
