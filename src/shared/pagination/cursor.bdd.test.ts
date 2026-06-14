import { describe, expect, it } from "vitest";
import { ApiError } from "@/shared/errors/apiError";
import { createCursor, readCursor } from "./cursor";

describe("Feature: Cursor pagination", () => {
  it("Scenario: Cursors are opaque and tied to request shape", async () => {
    const requestShape = {
      filters: { district: { eq: "central" } },
      sort: [{ field: "name", dir: "asc" }],
    };

    const cursor = await createCursor({
      requestShape,
      position: { last_id: "facility_1", last_name: "Amber House" },
    });

    expect(cursor).not.toContain("central");
    expect(cursor).not.toContain("Amber");
    await expect(readCursor(cursor, requestShape)).resolves.toEqual({
      last_id: "facility_1",
      last_name: "Amber House",
    });
    await expect(
      readCursor(cursor, {
        filters: { district: { eq: "east" } },
        sort: [{ field: "name", dir: "asc" }],
      }),
    ).rejects.toMatchObject({ code: "validation_failed" } satisfies Partial<ApiError>);
  });
});
