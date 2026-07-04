import type { Repositories } from "@/db/repositories/ports";
import { requireSessionAudience } from "@/shared/authz/policies";
import { ApiError } from "@/shared/errors/apiError";
import type { RequestContext } from "@/shared/request-context/context";
import { toSafeUser } from "@/application/auth/sessionService";

export class PartnerService {
  constructor(private readonly repos: Repositories) {}

  async getMe(ctx: RequestContext, csrfToken: string | null) {
    const userId = requireSessionAudience(ctx, "partner");
    const [user, companies, facilities] = await Promise.all([
      this.repos.users.findById(userId),
      this.repos.companies.listActiveForUser(userId),
      this.repos.partnerFacilities.listAccessibleForUser(userId, { limit: 1, offset: 0 }),
    ]);
    if (!user) {
      throw new ApiError("session_not_found", "Session user was not found.", 401);
    }

    return {
      user: toSafeUser(user),
      companies: companies.map((company) => ({
        id: company.id,
        name: company.name,
        status: company.status,
      })),
      managed_facility_count: facilities.total,
      csrf: {
        cookie_name: "gy_partner_session_csrf",
        header_name: "X-CSRF-Token",
        token: csrfToken,
      },
    };
  }

  async listManagedFacilities(ctx: RequestContext, input: { limit: number; offset: number }) {
    const userId = requireSessionAudience(ctx, "partner");
    const result = await this.repos.partnerFacilities.listAccessibleForUser(userId, input);
    return {
      data: result.rows.map((facility) => ({
        id: facility.id,
        company_id: facility.company_id as string,
        slug: facility.slug,
        name: facility.name,
        status: facility.status,
        is_enabled: facility.is_enabled,
        availability_status: facility.availability_status,
        beds_available: facility.beds_available,
        availability_updated_at: facility.availability_updated_at
          ? new Date(facility.availability_updated_at).toISOString()
          : null,
        version: facility.version,
        updated_at: new Date(facility.updated_at).toISOString(),
      })),
      page: {
        type: "offset" as const,
        limit: input.limit,
        offset: input.offset,
        has_more: result.hasMore,
        total_count: result.total,
      },
    };
  }
}
