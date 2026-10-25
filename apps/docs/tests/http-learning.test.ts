/** Checks authored HTTP guidance, grouped route examples and native catalog links using finite read-only source assertions. */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { features } from "../scripts/feature-catalog.js";
import { renderRelated } from "../scripts/generate-guides.js";
import { guideGroups, guideRelations } from "../scripts/guide-catalog.js";
import { httpGuideGroup } from "../scripts/http-guide-catalog.js";
const content = resolve(import.meta.dir, "../content");
/** Reads one owned HTTP guide at the native synchronous test boundary.
 * @param page - HTTP guide path selected by this suite.
 * @returns Original guide text; missing input fails the native test.
 */
const read = (page: string) =>
  readFileSync(resolve(content, `docs/modules/http/${page}.mdx`), "utf8");
test("connects Service to HTTP Routes without changing existing HTTP guide URLs", async () => {
  expect(guideGroups.map(({ directory }) => directory).slice(0, 5)).toEqual([
    "docs/learn",
    "docs/learn/concepts",
    "docs/modules/service",
    "docs/modules/http",
    "docs/modules/events",
  ]);
  expect((await import("../content/docs/modules/http/meta.js")).default).toMatchObject({
    title: "HTTP Routes",
    pages: httpGuideGroup.pages,
  });
  expect(
    guideRelations.find(({ path }) => path === "docs/modules/service/first-service")?.next,
  ).toBeUndefined();
  const relation = guideRelations.find(({ path }) => path === "docs/modules/service/first-service");
  if (relation === undefined) throw new Error("The first-service guide relation is missing");
  expect(renderRelated(relation)).not.toContain("Next step");
  expect(features.find(({ id }) => id === "http")?.guide).toBe("docs/modules/http/define");
  for (const page of httpGuideGroup.pages) {
    const source = read(page);
    expect((source.match(/^## .+$/gm) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(source).toContain(`/_snippets/generated/related/docs-modules-http-${page}.mdx`);
    if (page !== "index") expect(read("index")).toContain(`](/docs/modules/http/${page})`);
  }
});
test("teaches the Orders HTTP boundary with executable starter source and tests", async () => {
  const tutorial = read("first-route");
  for (const path of [
    "src/services/orders/service.ts",
    "src/routes/orders/route.ts",
    "tests/integration/orders.route.test.ts",
  ]) {
    expect(tutorial).toContain(`templates/default/v1/api/${path}`);
  }
  expect(tutorial).toContain("relkit-orders");
  expect(tutorial).toContain("bun run check");
  expect(tutorial).toContain("bun run typecheck");
  expect(tutorial).toContain("bun test tests/integration/orders.route.test.ts");
  expect(tutorial).toContain("HTTP `422`");
  expect(tutorial).toContain("test harness");
});
test("documents raw and RPC boundaries without promising REST-only policies on RPC", async () => {
  expect(read("raw-handlers")).toContain("named export `ALL`");
  expect(read("raw-handlers")).toContain("OpenAPI and generated-client operation");
  expect(read("generated-clients")).toContain("RPC over `/rpc`");
  expect(read("generated-clients")).toContain("Both execute the original route's authorization");
  expect(read("rate-limits")).toContain("tests/compiler/rate-limit.test.ts#local-rate-limit");
  expect(read("rate-limits")).toContain("not hashed");
  expect(read("middleware")).toContain("not token verification");
  expect(read("responses")).toContain("Declarations are not branch handlers");
});
