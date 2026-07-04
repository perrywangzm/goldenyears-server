export const capabilities = {
  user: {
    createSavedFacility: "user.create_saved_facility",
    createTourRequest: "user.create_tour_request",
    readOwnSession: "user.read_own_session",
  },
  partner: {
    updateManagedFacilityAvailability: "partner.update_managed_facility_availability",
  },
  staff: {
    moderateContent: "staff.moderate_content",
    editCms: "staff.edit_cms",
  },
} as const;

export type CapabilityGroup = keyof typeof capabilities;
