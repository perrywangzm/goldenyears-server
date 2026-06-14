export const capabilities = {
  family: {
    createSavedFacility: "family.create_saved_facility",
    createTourRequest: "family.create_tour_request",
    readOwnSession: "family.read_own_session",
  },
  facilityManager: {
    updateManagedFacilityAvailability: "facility_manager.update_managed_facility_availability",
  },
  staff: {
    moderateContent: "staff.moderate_content",
    editCms: "staff.edit_cms",
  },
} as const;

export type CapabilityGroup = keyof typeof capabilities;
