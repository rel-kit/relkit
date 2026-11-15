import { describe, expect, test } from "bun:test";
import { formatTimestamp, utcTimestamp } from "./format";

const iso = "2026-11-14T17:00:36.312Z";

describe("one timestamp format", () => {
  test("shows local time with the zone, to the millisecond", () => {
    expect(formatTimestamp(iso, { timeZone: "UTC" })).toBe("2026-11-14 17:00:36.312 UTC");
    expect(formatTimestamp(iso, { timeZone: "Europe/Berlin" })).toMatch(
      /^2026-11-14 18:00:36\.312 \S+$/,
    );
    expect(formatTimestamp(iso, { timeZone: "America/New_York" })).toMatch(
      /^2026-11-14 12:00:36\.312 \S+$/,
    );
  });

  test("can leave the date out for dense rows", () => {
    expect(formatTimestamp(iso, { timeZone: "UTC", date: false })).toBe("17:00:36.312 UTC");
  });

  test("gives the UTC value for the tooltip", () => {
    expect(utcTimestamp(iso)).toBe("2026-11-14 17:00:36.312 UTC");
    expect(utcTimestamp("2026-11-14T17:00:36Z")).toBe("2026-11-14 17:00:36.000 UTC");
  });

  test("an unusable time reads as unavailable", () => {
    expect(formatTimestamp(undefined)).toBe("—");
    expect(formatTimestamp("not a time")).toBe("—");
    expect(utcTimestamp("")).toBe("—");
  });

  test("midnight is 00, not 24", () => {
    expect(formatTimestamp("2026-11-14T00:00:00.000Z", { timeZone: "UTC" })).toBe(
      "2026-11-14 00:00:00.000 UTC",
    );
  });
});
