import { expect, test } from "bun:test";
import { exportCounters } from "./overview-export";

test("no exporter configured shows no export counters (IN-18)", () => {
  expect(
    exportCounters({ exporters: [], counters: { persisted: 10, exportFailures: 1823 } }),
  ).toEqual([]);
  expect(exportCounters(undefined)).toEqual([]);
});

test("with an exporter each counter says what it counts", () => {
  expect(
    exportCounters({
      exporters: [{ name: "otlp" }],
      counters: { persisted: 10, sampledOut: 2, exportFailures: 1, exportCapacityRejections: 4 },
    }),
  ).toEqual([
    { label: "Accepted by app capture", value: "10" },
    { label: "Not selected for export by sampling", value: "2" },
    { label: "Exporter calls that failed", value: "1", tone: "danger" },
    { label: "Not exported: export queue full", value: "4", tone: "danger" },
  ]);
});

test("an older application without capacity rejections omits that counter", () => {
  const counters = exportCounters({
    exporters: [{ name: "otlp" }],
    counters: { exportFailures: 0 },
  });
  expect(counters.map((item) => item.label)).not.toContain("Not exported: export queue full");
  expect(counters.find((item) => item.label === "Exporter calls that failed")?.tone).toBe(
    undefined,
  );
});
