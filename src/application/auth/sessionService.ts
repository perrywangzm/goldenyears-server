import { deleteCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import { AssessmentService, readAssessmentSessionCookie } from "@/application/assessment/assessmentService";
import type { IdentityProvisioningService } from "@/application/auth/identityProvisioningService";
import type { AppBindings } from "@/config/env";
import type { Repositories } from "@/db/repositories/ports";
import { sha256 } from "@/platform/crypto/passwordService";
import type { SupabaseAuthPort } from "@/platform/auth/supabaseAuthPort";
import { requireSessionAudience } from "@/shared/authz/policies";
import { csrfCookieNames, sessionCookieNames, type SessionAudience } from "@/shared/authz/sessionAudience";
import { ApiError } from "@/shared/errors/apiError";
import type { RequestContext } from "@/shared/request-context/context";

export class SessionService {
  constructor(
    private readonly repos: Repositories,
    private readonly supabaseAuth: SupabaseAuthPort,
    private readonly identityProvisioning: IdentityProvisioningService,
  ) {}

  async createSession(
    input: { email: string; password: string },
    c: Context<AppBindings>,
    audience: SessionAudience = "user",
  ) {
    const identity = await this.supabaseAuth.signInWithPassword(input.email, input.password);
    const user = await this.identityProvisioning.resolveOrProvision(identity);
    if (user.status !== "active") {
      throw new ApiError("unauthenticated", "Invalid email or password.", 401);
    }

    if (audience === "partner" && (await this.repos.companyUsers.countActiveCompanies(user.id)) === 0) {
      throw new ApiError("forbidden", "An active company membership is required.", 403);
    }

    const roles = await this.repos.users.rolesForUser(user.id);
    if (audience === "admin" && !roles.includes("admin")) {
      throw new ApiError("forbidden", "An admin role is required.", 403);
    }

    const token = crypto.randomUUID();
    const csrfToken = crypto.randomUUID();
    const session = await this.repos.sessions.create({
      id: `sess_${crypto.randomUUID()}`,
      user_id: user.id,
      token_hash: await sha256(token),
      audience,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      created_at: new Date(),
      revoked_at: null,
    });

    if (audience === "user") {
      const assessmentSessionId = readAssessmentSessionCookie(c.req.header("cookie"));
      if (assessmentSessionId) {
        await new AssessmentService(this.repos).claimAnonymousSession(user.id, session.id, assessmentSessionId);
      }
    }

    setCookie(c, sessionCookieNames[audience], token, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    setCookie(c, csrfCookieNames[audience], csrfToken, {
      httpOnly: false,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });

    return {
      session: {
        id: session.id,
        audience: session.audience,
        expires_at: new Date(session.expires_at).toISOString(),
      },
      user: toSafeUser(user),
      roles,
      csrf_token: csrfToken,
    };
  }

  async deleteSession(ctx: RequestContext, c: Context<AppBindings>, audience: SessionAudience = "user") {
    requireSessionAudience(ctx, audience);
    if (ctx.actor.sessionId) {
      await this.repos.sessions.revoke(ctx.actor.sessionId, ctx.now);
    }
    deleteCookie(c, sessionCookieNames[audience], { path: "/" });
    deleteCookie(c, csrfCookieNames[audience], { path: "/" });
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
      actor: {
        kind: "user",
        user_id: user.id,
        audience: ctx.actor.audience,
        roles: ctx.actor.roles,
      },
      user: toSafeUser(user),
      roles: ctx.actor.roles,
      counts: {
        saved_facilities: saved.length,
        unread_notifications: 0,
        managed_facilities: 0,
        review_invites: 0,
      },
    };
  }
}

export function toSafeUser(user: { id: string; email: string; display_name: string }) {
  return { id: user.id, email: user.email, display_name: user.display_name };
}
