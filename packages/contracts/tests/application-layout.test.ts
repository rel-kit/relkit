/**
 * Exercises declaration-driven layout selection and physical/logical path
 * separation. These pure cases cover missing boundaries, mixed/colliding roots,
 * nested services and helper-only inputs without introducing resource ownership.
 */
import { describe, expect, it } from "vitest";
import {
  selectApplicationLayout,
  serviceSource,
  serviceIdentityPath,
  applicationSourceLayer,
} from "../src/application-layout.js";

it("defaults empty authored evidence to grouped without inventing a service", () => {
  const layout = selectApplicationLayout("/app", []);
  expect(layout.kind).toBe("grouped");
  expect(layout.services).toEqual([]);
  expect(applicationSourceLayer(layout, "src/helpers/value.ts")).toEqual({ kind: "unowned" });
});

it.each(["flat", "grouped"] as const)("selects %s from an incomplete descriptor root", (kind) => {
  const root = kind === "grouped" ? "src/services/orders" : "src/orders";
  const layout = selectApplicationLayout("/app", [
    { file: `${root}/functions/get.function.ts`, kind: "function" },
  ]);
  expect(layout.kind).toBe(kind);
  expect(layout.services[0]?.boundary).toBe(`${root}/service.ts`);
  expect(applicationSourceLayer(layout, `${root}/policies/owner.ts`).kind).toBe("service");
  expect(layout.issues).toContainEqual(expect.objectContaining({ file: `${root}/service.ts` }));
});

it("rejects mixed evidence even when the service names differ", () => {
  const evidence = [
    { file: "src/orders/service.ts", kind: "service" },
    { file: "src/services/payments/service.ts", kind: "service" },
  ];
  const layout = selectApplicationLayout("/app", evidence);
  expect(layout.issues).toContainEqual(
    expect.objectContaining({
      file: "src/orders/service.ts",
      related: ["src/services/payments/service.ts"],
    }),
  );
  expect(layout).toEqual(selectApplicationLayout("/app", [...evidence].reverse()));
});

it.each(["orders", "Orders"])("retains both duplicate or colliding %s roots", (name) => {
  const layout = selectApplicationLayout("/app", [
    { file: "src/services/orders/service.ts", kind: "service" },
    { file: `src/${name}/service.ts`, kind: "service" },
  ]);
  expect(layout.issues.some((issue) => issue.message.includes("case-colliding"))).toBe(true);
});

it("rejects aggregate and nested boundaries but permits internal hierarchy", () => {
  const layout = selectApplicationLayout("/app", [
    { file: "src/services/service.ts", kind: "service" },
    { file: "src/services/orders/nested/service.ts", kind: "service" },
    { file: "src/services/orders/functions/nested/get.function.ts", kind: "function" },
  ]);
  expect(layout.issues.some((issue) => issue.message.includes("grouping container"))).toBe(true);
  expect(layout.issues.some((issue) => issue.message.includes("nested"))).toBe(true);
  expect(layout.issues.map((issue) => issue.message).join(" ")).toContain(
    "src/services/orders/service.ts",
  );
  expect(layout.services).toHaveLength(1);
});

it("keeps removed layer-first roots invalid", () => {
  const layout = selectApplicationLayout("/app", [
    { file: "src/functions/get.function.ts", kind: "function" },
  ]);
  expect(layout.issues[0]?.message).toContain("Legacy layer-first root");
});

it("projects only the root grouping segment and retains physical provenance", () => {
  const file = "src/services/orders/functions/services/get.function.ts";
  expect(serviceIdentityPath(file)).toBe("src/orders/functions/services/get.function.ts");
  expect(serviceSource(file)?.root).toBe("src/services/orders");
  expect(serviceIdentityPath("src/orders/services/get.function.ts")).toBe(
    "src/orders/services/get.function.ts",
  );
  expect(serviceIdentityPath("src/routes/services/route.ts")).toBe("src/routes/services/route.ts");
});

it("keeps selection results immutable and independent of caller mutation", () => {
  const item = { file: "src/orders/service.ts", kind: "service" };
  const evidence = [item];
  const layout = selectApplicationLayout("/app", evidence);
  item.file = "src/payments/service.ts";
  expect(layout.evidence[0]?.file).toBe("src/orders/service.ts");
  expect(Object.isFrozen(layout.services[0])).toBe(true);
  expect(Object.isFrozen(layout.evidence[0])).toBe(true);
});
