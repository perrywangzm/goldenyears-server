import { z } from "@hono/zod-openapi";
import { FacilityCardSchema } from "@/interface/schemas/marketplace.schema";

export const FacilityIdRequestSchema = z
  .object({ facility_id: z.string().min(1) })
  .strict()
  .openapi("FacilityIdRequest");

export const SavedFacilitySchema = z
  .object({
    id: z.string(),
    facility_id: z.string(),
    created_at: z.string(),
  })
  .strict()
  .openapi("SavedFacility");

export const CreateTourRequestSchema = z
  .object({
    facility_id: z.string().min(1),
    contact_name: z.string().min(1),
    contact_phone: z.string().min(3),
    contact_email: z.email(),
    preferred_date: z.string().min(1),
    preferred_time: z.string().min(1),
    care_notes: z.string().max(2000).nullable().optional(),
  })
  .strict()
  .openapi("CreateTourRequest");

export const TourRequestSchema = z
  .object({
    id: z.string(),
    facility_id: z.string(),
    status: z.enum(["pending_review", "confirmed", "declined", "attended", "no_show", "cancelled"]),
    contact_name: z.string(),
    contact_phone: z.string(),
    contact_email: z.string(),
    preferred_date: z.string(),
    preferred_time: z.string(),
    care_notes: z.string().nullable(),
    version: z.number().int(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict()
  .openapi("TourRequest");

export const AccountDashboardSchema = z
  .object({
    counts: z.object({
      saved_facilities: z.number().int(),
      tour_requests: z.number().int(),
      unread_notifications: z.number().int(),
      review_invites: z.number().int(),
    }),
    recent_tour_requests: z.array(
      z.object({
        id: z.string(),
        facility_id: z.string(),
        status: z.string(),
        preferred_date: z.string(),
        preferred_time: z.string(),
      }),
    ),
  })
  .strict()
  .openapi("AccountDashboard");

export const SavedFacilityCardSchema = FacilityCardSchema;
