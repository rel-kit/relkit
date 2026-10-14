/** Verifies grouped convention suggestions remain warnings and preserve named route/task exports. */
import { expect, it } from "vitest";
import { checkConventions } from "../src/conventions.js";

it.each(["src/orders", "src/services/orders"])("suggests the actual %s service root", (root) => {
  const warnings = checkConventions({
    descriptor: { kind: "function", id: "orders.get" },
    sourcePath: `${root}/get.ts`,
    exportKind: "named",
  });
  expect(warnings.length).toBeGreaterThan(0);
  expect(warnings.every((warning) => warning.severity === "warning")).toBe(true);
  expect(warnings.some((warning) => warning.suggestion?.includes(`${root}/functions`))).toBe(true);
});

it("accepts named HTTP exports and named task exports in both layouts", () => {
  for (const root of ["src/orders", "src/services/orders"]) {
    const task = checkConventions({
      descriptor: { kind: "task", id: "orders.export" },
      sourcePath: `${root}/tasks/export.task.ts`,
      exportKind: "named",
    });
    expect(task).toEqual([]);
  }
  expect(
    checkConventions({
      descriptor: { kind: "route", id: "orders.get" },
      sourcePath: "src/routes/orders/route.ts",
      exportName: "GET",
      exportKind: "named",
    }),
  ).toEqual([]);
});
