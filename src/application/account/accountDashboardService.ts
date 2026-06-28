import type { Repositories } from "@/db/repositories/ports";
import { AssessmentService } from "@/application/assessment/assessmentService";
import { requireFamilyUser } from "@/shared/authz/policies";
import type { RequestContext } from "@/shared/request-context/context";

export class AccountDashboardService {
  constructor(private readonly repos: Repositories) {}

  async getDashboard(ctx: RequestContext) {
    const userId = requireFamilyUser(ctx);
    const [saved, tours, latestAssessment] = await Promise.all([
      this.repos.savedFacilities.listForUser(userId),
      this.repos.tours.listForUser(userId),
      new AssessmentService(this.repos).getLatestSummaryForUser(userId),
    ]);
    return {
      counts: {
        saved_facilities: saved.length,
        tour_requests: tours.length,
        unread_notifications: 0,
        review_invites: 0,
      },
      recent_tour_requests: tours.slice(0, 5).map((tour) => ({
        id: tour.id,
        facility_id: tour.facility_id,
        status: tour.status,
        preferred_date: tour.preferred_date,
        preferred_time: tour.preferred_time,
      })),
      latest_assessment: latestAssessment,
    };
  }
}
