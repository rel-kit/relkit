import { expect, test } from "bun:test";
import { logClock, logTimeZone } from "../app/logs/log-format";

const at = "2026-11-15T10:05:01.206Z";

test("a log time carries its zone and its UTC form (IN-35)", () => {
  const clock = logClock(at);
  expect(clock.full).toMatch(/^2026-11-1[45] \d{2}:05:01\.206 \S+/);
  expect(clock.utc).toBe("2026-11-15 10:05:01.206 UTC");
});

test("the zone of the column is the viewer's", () => {
  expect(logTimeZone("2026-11-15T10:05:01.206Z", "UTC")).toBe("UTC");
  expect(logTimeZone("2026-01-15T10:05:01.206Z", "America/New_York")).toBe("EST");
});
