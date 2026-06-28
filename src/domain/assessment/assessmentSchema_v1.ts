import type { InternalAssessmentSchema } from "./types";

export const ASSESSMENT_SCHEMA_V1 = "assessment_v1";

export const assessmentSchemaV1: InternalAssessmentSchema = {
  schema_version: ASSESSMENT_SCHEMA_V1,
  title: "What level of care do you actually need?",
  estimated_minutes: 2,
  disclaimer: {
    kind: "non_diagnostic",
    text: "This assessment is guidance only and is not a medical diagnosis.",
  },
  care_types: [
    {
      id: "independent",
      name: "Independent Living",
      blurb:
        "Active senior living with hospitality, security and community -- but no daily care. Apartments and clubhouses, not bedrooms and call buttons.",
      next: "Look for places that offer optional 'add-on' care so you can scale up later if needs change.",
    },
    {
      id: "assisted",
      name: "Assisted Living",
      blurb:
        "Help with daily activities like bathing, dressing and medication, while preserving as much independence as possible. The most common starting point.",
      next: "On your tours, ask specifically about staff-to-resident ratios at night and how care plans are reviewed.",
    },
    {
      id: "nursing",
      name: "Nursing Home",
      blurb:
        "24-hour skilled nursing care for people with significant medical needs. Higher staffing, more clinical environment.",
      next: "Check for on-site doctor visits, palliative-care capability, and the home's relationship with nearby hospitals.",
    },
    {
      id: "dementia",
      name: "Dementia Care",
      blurb:
        "Specialist memory-care environments designed around cognitive decline -- secure layouts, calm colours, household-scale clusters, dementia-trained staff.",
      next: "Ask how they handle wandering, sundowning, and how families are involved in care plan reviews.",
    },
    {
      id: "respite",
      name: "Respite Care",
      blurb:
        "Short-term stays from a few days to a few months. For caregiver breaks, post-hospital recovery, or 'try-before-you-decide' before a longer placement.",
      next: "Confirm minimum/maximum stay lengths and how quickly they can admit (some facilities take respite same-week).",
    },
    {
      id: "daycare",
      name: "Day Care Centre",
      blurb:
        "Daytime activities, meals and supervision; the senior returns home each evening. Strong fit when family provides care but needs daytime relief.",
      next: "Ask about door-to-door transport coverage and whether subsidies apply to your situation.",
    },
  ],
  feature_labels: {
    med247: "24/7 medical coverage",
    physio: "On-site physiotherapy",
    hospice: "Hospice / palliative care",
    dementia_trained: "Dementia-trained staff",
    halal: "Halal-certified meals",
    vegetarian: "Vegetarian options",
    diabetic: "Diabetic-friendly menu",
    wheelchair: "Wheelchair accessible",
    private_room: "Private rooms available",
    garden: "Garden / outdoor space",
    ensuite: "En-suite bathrooms",
    activities: "Daily activities programme",
    family_lounge: "Family visiting lounge",
    outings: "Group outings",
    transport: "Transport for appointments",
    subsidy: "Government subsidy eligible",
  },
  questions: [
    {
      id: "for_whom",
      title: "Who are you exploring care for?",
      sub: "We'll tailor what we ask next to your situation.",
      required: true,
      skip_if: null,
      options: [
        { id: "self", label: "Myself", emoji: "🌷" },
        { id: "parent", label: "A parent", emoji: "👨‍👩‍👧" },
        { id: "spouse", label: "My spouse", emoji: "💞" },
        { id: "other", label: "Another family member", emoji: "🤝" },
      ],
    },
    {
      id: "daily_help",
      title: "How much help with daily activities is needed?",
      sub: "Bathing, dressing, eating, getting around safely. Be honest -- this shapes the recommendation more than anything else.",
      required: true,
      skip_if: null,
      options: [
        { id: "none", label: "None -- manages independently", scores: { independent: 3 } },
        { id: "light", label: "Light help, occasionally", scores: { independent: 1, assisted: 2, daycare: 2 } },
        { id: "daily", label: "Daily help with several activities", scores: { assisted: 3, daycare: 1 } },
        { id: "247", label: "Round-the-clock help", scores: { nursing: 3, assisted: 1, dementia: 1 } },
      ],
    },
    {
      id: "cognitive",
      title: "Are there cognitive concerns?",
      sub: "Memory loss, confusion, wandering, or changes in behaviour.",
      required: true,
      skip_if: null,
      options: [
        { id: "none", label: "No concerns", scores: {} },
        { id: "mild", label: "Mild forgetfulness, no diagnosis", scores: { independent: 1, assisted: 1 } },
        { id: "early", label: "Diagnosed dementia -- early stage", scores: { dementia: 2, assisted: 1, daycare: 1 } },
        {
          id: "moderate",
          label: "Diagnosed dementia -- moderate or advanced",
          scores: { dementia: 4, nursing: 1 },
          override: "dementia",
        },
      ],
    },
    {
      id: "medical",
      title: "What does the medical picture look like?",
      sub: "Conditions, medications, recent hospital stays.",
      required: true,
      skip_if: null,
      options: [
        { id: "healthy", label: "Healthy and stable", scores: { independent: 2 } },
        { id: "stable", label: "Some conditions, well-managed", scores: { assisted: 1, independent: 1 } },
        { id: "complex", label: "Multiple conditions, complex medication", scores: { assisted: 2, nursing: 1 } },
        { id: "recovery", label: "Recent hospitalisation or post-surgery recovery", scores: { respite: 3, nursing: 1 } },
        {
          id: "skilled",
          label: "Skilled nursing required (wounds, IV, ventilator, tube feeding)",
          scores: { nursing: 4 },
          override: "nursing",
        },
      ],
    },
    {
      id: "urgency",
      title: "How urgent is this?",
      sub: "Affects whether short-term respite or longer-term placement makes sense.",
      required: true,
      skip_if: null,
      options: [
        { id: "exploring", label: "Just exploring for the future", scores: {} },
        { id: "few_months", label: "Within the next few months", scores: {} },
        {
          id: "short_term",
          label: "Short-term solution -- caregiver break, post-hospital recovery",
          scores: { respite: 4, daycare: 2 },
        },
        { id: "urgent", label: "Urgent -- within the next few weeks", scores: {} },
      ],
    },
    {
      id: "current_situation",
      title: "What does daily life look like now?",
      required: true,
      skip_if: null,
      options: [
        { id: "alone_fine", label: "Living alone, managing OK but feeling isolated", scores: { independent: 2, daycare: 1 } },
        { id: "alone_struggle", label: "Living alone, struggling with some things", scores: { assisted: 2, daycare: 1 } },
        { id: "with_family", label: "Living with family who provides care", scores: { daycare: 2, respite: 1 } },
        { id: "hospital", label: "Currently in hospital", scores: { respite: 2, nursing: 1 } },
        { id: "in_facility", label: "Currently in a facility, exploring alternatives", scores: {} },
      ],
    },
    {
      id: "caregiver",
      title: "How is the primary caregiver coping?",
      sub: "Caregiver wellbeing matters -- there's no good outcome if the family member providing care burns out.",
      required: true,
      skip_if: { question_id: "for_whom", equals: "self" },
      options: [
        { id: "fine", label: "Coping fine", scores: {} },
        { id: "stretched", label: "Stretched thin", scores: { daycare: 2, respite: 1 } },
        { id: "burnt_out", label: "Burnt out, need a break", scores: { respite: 3, daycare: 2 } },
      ],
    },
  ],
};
