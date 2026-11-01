import { describe, expect, test } from "bun:test";
import type { DiagnosticView } from "./env-diagnostics-model";
import { groupDiagnostics, severityCounts } from "./overview-diagnostics";

const items: readonly DiagnosticView[] = [
  { code: "I1", severity: "info", message: "info", source: { file: "b.ts", line: 1, column: 1 } },
  { code: "E1", severity: "error", message: "error", source: { file: "b.ts", line: 2, column: 1 } },
  {
    code: "W1",
    severity: "warning",
    message: "warn",
    source: { file: "a.ts", line: 1, column: 1 },
  },
  { code: "W2", severity: "warning", message: "warn", descriptorId: "routes.get" },
];

describe("severityCounts", () => {
  test("counts every severity, including absent ones", () => {
    expect(severityCounts(items)).toEqual({ error: 1, warning: 2, info: 1 });
    expect(severityCounts([])).toEqual({ error: 0, warning: 0, info: 0 });
  });
});

describe("groupDiagnostics", () => {
  test("groups by severity, most urgent first", () => {
    expect(
      groupDiagnostics(items, "severity").map((group) => [
        group.label,
        group.items.map((item) => item.code),
      ]),
    ).toEqual([
      ["error", ["E1"]],
      ["warning", ["W1", "W2"]],
      ["info", ["I1"]],
    ]);
  });

  test("groups by source with error files first and falls back to the descriptor", () => {
    expect(
      groupDiagnostics(items, "source").map((group) => [
        group.label,
        group.items.map((item) => item.code),
      ]),
    ).toEqual([
      ["b.ts", ["E1", "I1"]],
      ["a.ts", ["W1"]],
      ["routes.get", ["W2"]],
    ]);
  });

  test("applies a severity filter", () => {
    expect(groupDiagnostics(items, "source", "warning").map((group) => group.label)).toEqual([
      "a.ts",
      "routes.get",
    ]);
  });
});
