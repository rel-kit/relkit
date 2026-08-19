import { expect, test } from "bun:test";
import { createObservabilityCollector } from "./src/index.ts";

test("collector admits redacted records and retains only its bounded newest window", () => {
  const collector = createObservabilityCollector({ maxRecords: 2 });
  collector.emit({
    type: "log.emitted",
    timestamp: "2026-08-16T00:00:00.000Z",
    level: "info",
    component: "test",
    message: "safe",
    fields: { token: "top-secret-token", visible: "yes" },
  });
  collector.emit({
    version: 1,
    signal: "diagnostic",
    code: "ZSYS_TEST",
    severity: "info",
    message: "first",
    occurredAt: "2026-08-16T00:00:00.001Z",
  });
  collector.emit({
    version: 1,
    signal: "diagnostic",
    code: "ZSYS_TEST",
    severity: "info",
    message: "second",
    occurredAt: "2026-08-16T00:00:00.002Z",
  });

  const records = collector.read();
  expect(records).toHaveLength(2);
  expect(records.map((record) => record.signal)).toEqual(["diagnostic", "diagnostic"]);
  expect(JSON.stringify(records)).not.toContain("top-secret-token");
  expect(JSON.stringify(records)).toContain("second");
  expect(records.every((record) => Object.isFrozen(record))).toBe(true);
  expect(collector.dropped()).toBe(1);
});
