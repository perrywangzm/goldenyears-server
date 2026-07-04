export type SessionAudience = "user" | "partner" | "admin";

export const sessionCookieNames: Record<SessionAudience, string> = {
  user: "gy_user_session",
  partner: "gy_partner_session",
  admin: "gy_admin_session",
};

export const csrfCookieNames: Record<SessionAudience, string> = {
  user: "gy_user_session_csrf",
  partner: "gy_partner_session_csrf",
  admin: "gy_admin_session_csrf",
};

export function expectedAudienceForPath(path: string): SessionAudience {
  if (path.startsWith("/api/v1/partner/")) return "partner";
  if (path.startsWith("/api/v1/admin/")) return "admin";
  return "user";
}
