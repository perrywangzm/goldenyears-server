import type { Repositories } from "@/db/repositories/ports";
import { AuditWriter } from "@/shared/audit/auditWriter";
import { requireFamilyUser } from "@/shared/authz/policies";
import { IdempotencyService } from "@/shared/idempotency/idempotencyService";
import { OutboxWriter } from "@/shared/outbox/outboxWriter";
import type { RequestContext } from "@/shared/request-context/context";

export interface CreateTourRequestInput {
  facility_id: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  preferred_date: string;
  preferred_time: string;
  care_notes?: string | null;
}

export class TourRequestService {
  private readonly audit: AuditWriter;
  private readonly outbox: OutboxWriter;
  private readonly idempotency: IdempotencyService;

  constructor(private readonly repos: Repositories) {
    this.audit = new AuditWriter(repos.audit);
    this.outbox = new OutboxWriter(repos.outbox);
    this.idempotency = new IdempotencyService(repos.idempotency);
  }

  async create(ctx: RequestContext, input: CreateTourRequestInput, idempotencyKey: string | null) {
    const userId = requireFamilyUser(ctx);
    const facility = await this.repos.facilities.findPublicById(input.facility_id);
    const result = await this.idempotency.run({
      key: idempotencyKey,
      userId,
      requestBody: input,
      execute: async () => {
        const now = new Date();
        const tour = await this.repos.tours.create({
          id: `tour_${crypto.randomUUID()}`,
          user_id: userId,
          facility_id: facility.id,
          status: "pending_review",
          contact_name: input.contact_name,
          contact_phone: input.contact_phone,
          contact_email: input.contact_email,
          preferred_date: input.preferred_date,
          preferred_time: input.preferred_time,
          care_notes: input.care_notes ?? null,
          version: 1,
          created_at: now,
          updated_at: now,
        });
        await this.audit.write(ctx, {
          action: "create_tour_request",
          resourceType: "tour_request",
          resourceId: tour.id,
          metadata: { facility_id: facility.id },
        });
        await this.outbox.write({
          eventType: "tour_request.created",
          aggregateType: "tour_request",
          aggregateId: tour.id,
          payload: { tour_request_id: tour.id, facility_id: facility.id, user_id: userId },
        });
        return toTourDto(tour);
      },
    });
    return result.result;
  }

  async list(ctx: RequestContext) {
    const userId = requireFamilyUser(ctx);
    const tours = await this.repos.tours.listForUser(userId);
    return tours.map(toTourDto);
  }
}

function toTourDto(tour: {
  id: string;
  facility_id: string;
  status: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  preferred_date: string;
  preferred_time: string;
  care_notes: string | null;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
}) {
  return {
    id: tour.id,
    facility_id: tour.facility_id,
    status: tour.status,
    contact_name: tour.contact_name,
    contact_phone: tour.contact_phone,
    contact_email: tour.contact_email,
    preferred_date: tour.preferred_date,
    preferred_time: tour.preferred_time,
    care_notes: tour.care_notes,
    version: tour.version,
    created_at: new Date(tour.created_at).toISOString(),
    updated_at: new Date(tour.updated_at).toISOString(),
  };
}
