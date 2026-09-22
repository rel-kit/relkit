import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { features } from "../scripts/feature-catalog.js";
import { renderRelated } from "../scripts/generate-guides.js";
import { guideGroups, guideRelations } from "../scripts/guide-catalog.js";
import { httpGuideGroup } from "../scripts/http-guide-catalog.js";
const content = resolve(import.meta.dir, "../content/docs");
const read = (page: string) => readFileSync(resolve(content, `http/${page}.mdx`), "utf8");
test("connects Service to HTTP Routes without changing existing HTTP guide URLs", () => {
  expect(guideGroups.map(({ directory }) => directory).slice(0, 5)).toEqual([
    "start",
    "fundamentals",
    "service",
    "http",
    "events",
  ]);
  expect(JSON.parse(readFileSync(resolve(content, "http/meta.json"), "utf8"))).toEqual({
    title: "HTTP Routes",
    icon: "Globe",
    pages: httpGuideGroup.pages,
  });
  expect(guideRelations.find(({ path }) => path === "service/first-service")?.next).toBeUndefined();
  expect(
    renderRelated(guideRelations.find(({ path }) => path === "service/first-service")!),
  ).not.toContain("Next step");
  expect(features.find(({ id }) => id === "http")?.guide).toBe("http/define");
  for (const page of httpGuideGroup.pages) {
    const source = read(page);
    expect((source.match(/^## .+$/gm) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(source).toContain(`content/generated/related/http-${page}.mdx`);
    if (page !== "index") expect(read("index")).toContain(`](/docs/http/${page})`);
  }
});
test("teaches the Orders HTTP boundary with executable starter source and tests", () => {
  const tutorial = read("first-route");
  for (const path of [
    "src/orders/service.ts",
    "src/routes/orders/route.ts",
    "tests/integration/orders.route.test.ts",
  ]) {
    expect(tutorial).toContain(`../../templates/default/v1/api/${path}`);
  }
  expect(tutorial).toContain("relkit-orders");
  expect(tutorial).toContain("bun run check");
  expect(tutorial).toContain("bun run typecheck");
  expect(tutorial).toContain("bun test tests/integration/orders.route.test.ts");
  expect(tutorial).toContain("HTTP `422`");
  expect(tutorial).toContain("test harness");
});
test("documents raw and RPC boundaries without promising REST-only policies on RPC", () => {
  expect(read("raw-handlers")).toContain("named export `ALL`");
  expect(read("raw-handlers")).toContain("OpenAPI and generated-client operation");
  expect(read("generated-clients")).toContain("RPC over `/rpc`");
  expect(read("generated-clients")).toContain("Both execute the original route's authorization");
  expect(read("rate-limits")).toContain("tests/compiler/rate-limit.test.ts#local-rate-limit");
  expect(read("rate-limits")).toContain("not hashed");
  expect(read("middleware")).toContain("not token verification");
  expect(read("responses")).toContain("Declarations are not branch handlers");
});
