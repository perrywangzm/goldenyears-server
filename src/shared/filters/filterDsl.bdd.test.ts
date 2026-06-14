import { describe, expect, it } from "vitest";
import { ApiError } from "@/shared/errors/apiError";
import { flattenFieldPredicates, parseFilterDsl } from "./filterDsl";

describe("Feature: Filter DSL validation", () => {
  it("Scenario: Unsupported filter operators are rejected", () => {
    const filters = { location: { nearish: "Bukit Timah" } };

    expect(() => parseFilterDsl(filters)).toThrow(ApiError);
    expect(() => parseFilterDsl(filters)).toThrow(/Invalid filter DSL|Unsupported filter operator/);

    try {
      flattenFieldPredicates(filters);
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe("validation_failed");
    }
  });
});
