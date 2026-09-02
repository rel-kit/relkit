import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { features } from "../scripts/feature-catalog.js";
import { guideGroups, guideRelations } from "../scripts/guide-catalog.js";
import { serviceGuideGroup } from "../scripts/service-guide-catalog.js";

const content = resolve(import.meta.dir, "../content/docs");
const read = (page: string) => readFileSync(resolve(content, `service/${page}.mdx`), "utf8");

test("introduces Service after Core concepts with source-backed, connected guides", () => {
  expect(guideGroups.map(({ directory }) => directory).slice(0, 5)).toEqual([
    "start",
    "fundamentals",
    "service",
    "http",
    "events",
  ]);
  expect(JSON.parse(readFileSync(resolve(content, "service/meta.json"), "utf8"))).toEqual({
    title: "Service",
    icon: "Boxes",
    pages: serviceGuideGroup.pages,
  });
  expect(guideRelations.find(({ path }) => path === "fundamentals/environment")?.next).toBe(
    "service/index",
  );
  expect(features.find(({ id }) => id === "services")?.guide).toBe("service/define");
  for (const page of serviceGuideGroup.pages) {
    const source = read(page);
    expect((source.match(/^## .+$/gm) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(source).toContain(`content/generated/related/service-${page}.mdx`);
    expect(source).toMatch(/<include[^>]*lang="ts"/);
  }
});

test("routes code-placement questions into existing capability and HTTP guides", () => {
  const organization = read("organization");
  for (const path of [
    "fundamentals/functions",
    "events",
    "events/consume",
    "jobs",
    "jobs/schedules",
    "ai",
    "ai/tools",
    "ai/first-agent",
    "caching",
    "storage",
    "database",
    "database/schema",
    "database/models",
    "database/migrations",
    "fundamentals/schemas",
    "fundamentals/errors",
    "operations/testing",
  ]) {
    expect(organization).toContain(`](/docs/${path})`);
  }
  const routes = read("routes");
  for (const path of ["routes", "requests", "uploads", "middleware", "responses", "openapi"]) {
    expect(routes).toContain(`](/docs/http/${path})`);
  }
  expect(routes).not.toContain("](/docs/routes");
});

test("walks through a service using the executable minimal-template function and HTTP tests", () => {
  const tutorial = read("first-service");
  for (const path of [
    "src/hello/functions/hello.function.ts",
    "src/hello/service.ts",
    "src/routes/hello/route.ts",
    "tests/unit/hello.function.test.ts",
    "tests/integration/hello.route.test.ts",
  ]) {
    expect(tutorial).toContain(`../../templates/default/v1/minimal/${path}`);
  }
  expect(tutorial).toContain("bun run check");
  expect(tutorial).toContain("bun run typecheck");
  expect(tutorial).toContain("bun test tests/unit/hello.function.test.ts");
  expect(tutorial).toContain("bun test tests/integration/hello.route.test.ts");
  expect(tutorial).toContain("/hello?name=RELKIT");
});
