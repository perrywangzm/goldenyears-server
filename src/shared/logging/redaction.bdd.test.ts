import { describe, expect, it } from "vitest";
import { serializeLogMeta } from "./logger";

describe("Feature: Sensitive log redaction", () => {
  it("Scenario: Sensitive fields are removed from structured logs", () => {
    const serialized = serializeLogMeta({
      request_id: "req_1",
      operation: "create_tour_request",
      body: {
        phone: "+65 9999 9999",
        email: "family@example.com",
        careNotes: "Needs night supervision",
        assessmentAnswers: [{ mobility: "limited" }],
        answers: { daily_help: "daily" },
        incomeInputs: { monthly_income: 3000 },
        facility_id: "facility_1",
      },
    });

    expect(serialized).toMatchObject({
      request_id: "req_1",
      operation: "create_tour_request",
      body: {
        phone: "[redacted]",
        email: "[redacted]",
        careNotes: "[redacted]",
        assessmentAnswers: "[redacted]",
        answers: "[redacted]",
        incomeInputs: "[redacted]",
        facility_id: "facility_1",
      },
    });
  });
});
