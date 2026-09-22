import { expect, test } from "bun:test";
import { resolveProcedure } from "./src/react/procedure.ts";

test("keeps exact dotted route keys while resolving nested job paths", () => {
  const route = { marker: "route" };
  const trigger = { marker: "trigger" };
  const root = { "orders.get": route, jobs: { exportOrders: { trigger } } };

  expect(resolveProcedure(root, "orders.get")).toBe(route);
  expect(resolveProcedure(root, "jobs.exportOrders.trigger")).toBe(trigger);
  expect(resolveProcedure(root, ["jobs", "exportOrders", "trigger"])).toBe(trigger);
  expect(resolveProcedure(root, "jobs.exportOrders.runs.watch")).toBeUndefined();
});
