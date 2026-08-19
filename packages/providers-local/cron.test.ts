import { describe, expect, test } from "bun:test";
import { nextCronFire } from "./src/jobs/cron.ts";

describe("internal cron adapter", () => {
  test("returns the next fire time without exposing parser values", () => {
    expect(
      nextCronFire("0 2 * * *", {
        timezone: "UTC",
        currentDate: new Date("2026-08-14T00:00:00.000Z"),
      }),
    ).toEqual(new Date("2026-08-14T02:00:00.000Z"));
  });

  test("rejects invalid cron expressions", () => {
    expect(() =>
      nextCronFire("61 * * * *", {
        timezone: "UTC",
        currentDate: new Date("2026-08-14T00:00:00.000Z"),
      }),
    ).toThrow();
  });
});
