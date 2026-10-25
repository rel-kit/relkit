/** Checks service placement, native public authoring examples and linked capability guides through finite read-only source assertions. */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { features } from "../scripts/feature-catalog.js";
import { guideGroups, guideRelations } from "../scripts/guide-catalog.js";
import { serviceGuideGroup } from "../scripts/service-guide-catalog.js";
const content = resolve(import.meta.dir, "../content");
/** Reads one owned service guide at the native synchronous test boundary.
 * @param page - Service guide path selected by this suite.
 * @returns Original guide text; missing input fails the native test.
 */
const read = (page: string) =>
  readFileSync(resolve(content, `docs/modules/service/${page}.mdx`), "utf8");
test("introduces Service after Core concepts with source-backed, connected guides", async () => {
  expect(guideGroups.map(({ directory }) => directory).slice(0, 5)).toEqual([
    "docs/learn",
    "docs/learn/concepts",
    "docs/modules/service",
    "docs/modules/http",
    "docs/modules/events",
  ]);
  expect((await import("../content/docs/modules/service/meta.js")).default).toMatchObject({
    title: "Service",
    pages: serviceGuideGroup.pages,
  });
  expect(
    guideRelations.find(({ path }) => path === "docs/learn/concepts/environment")?.next,
  ).toBeUndefined();
  expect(features.find(({ id }) => id === "services")?.guide).toBe("docs/modules/service/define");
  for (const page of serviceGuideGroup.pages) {
    const source = read(page);
    expect((source.match(/^## .+$/gm) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(source).toContain(`/_snippets/generated/related/docs-modules-service-${page}.mdx`);
  }
});
test("routes code-placement questions into existing capability and HTTP guides", async () => {
  const organization = read("organization");
  for (const path of [
    "docs/learn/concepts/functions",
    "docs/modules/events",
    "docs/modules/events/consume",
    "docs/modules/jobs",
    "docs/modules/jobs/schedules",
    "docs/modules/ai",
    "docs/modules/ai/tools",
    "guides/ai/build-an-offline-agent",
    "docs/modules/caching",
    "docs/modules/storage",
    "docs/modules/database",
    "docs/modules/database/schema",
    "docs/modules/database/models",
    "docs/modules/database/migrations",
    "docs/learn/concepts/schemas",
    "docs/learn/concepts/errors",
    "docs/modules/operations/testing",
  ]) {
    expect(organization).toContain(`](/${path})`);
  }
  const routes = read("routes");
  for (const path of ["routes", "requests", "uploads", "middleware", "responses", "openapi"]) {
    expect(routes).toContain(`](/docs/modules/http/${path})`);
  }
  expect(routes).not.toContain("](/docs/routes");
});
test("walks through the Orders service using the executable API starter", async () => {
  const tutorial = read("first-service");
  for (const path of [
    "src/services/orders/functions/create-order.function.ts",
    "src/services/orders/service.ts",
    "src/routes/orders/route.ts",
    "tests/unit/orders.function.test.ts",
  ]) {
    expect(tutorial).toContain(`templates/default/v1/api/${path}`);
  }
  expect(tutorial).toContain("bun run check");
  expect(tutorial).toContain("bun run typecheck");
  expect(tutorial).toContain("bun test tests/unit/orders.function.test.ts");
  expect(tutorial).toContain("bun test tests/integration/orders.route.test.ts");
  expect(tutorial).toContain("POST /orders");
});
