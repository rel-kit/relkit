import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { features } from "../scripts/feature-catalog.js";
import { renderRelated } from "../scripts/generate-guides.js";
import { guideGroups, guideRelations } from "../scripts/guide-catalog.js";
import { jobsGuideGroup } from "../scripts/jobs-guide-catalog.js";

const content = resolve(import.meta.dir, "../content/docs");
const read = (page: string) => readFileSync(resolve(content, `jobs/${page}.mdx`), "utf8");

test("connects Jobs between Events and Database with source-backed guides", () => {
  expect(guideGroups.map(({ directory }) => directory).slice(0, 7)).toEqual([
    "start",
    "fundamentals",
    "service",
    "http",
    "events",
    "jobs",
    "database",
  ]);
  expect(JSON.parse(readFileSync(resolve(content, "jobs/meta.json"), "utf8"))).toEqual({
    title: "Jobs",
    icon: "ListTodo",
    pages: jobsGuideGroup.pages,
  });
  expect(guideRelations.find(({ path }) => path === "events/first-event")?.next).toBe("jobs/index");
  expect(
    renderRelated(guideRelations.find(({ path }) => path === "events/first-event")!),
  ).toContain("[Jobs](/docs/jobs)");
  expect(guideRelations.find(({ path }) => path === "jobs/troubleshooting")?.next).toBe(
    "database/index",
  );
  expect(features.find(({ id }) => id === "jobs")?.guide).toBe("jobs/quickstart");
  expect(features.find(({ id }) => id === "schedules")?.guide).toBe("jobs/schedules");
  for (const page of jobsGuideGroup.pages) {
    const source = read(page);
    expect(source).toMatch(/<include[^>]*lang="(?:ts|json)"/);
    expect(source).toContain(`content/generated/related/jobs-${page}.mdx`);
    if (["quickstart", "tasks", "bindings", "clients", "schedules", "providers"].includes(page))
      expect(read("index")).toContain(`](/docs/jobs/${page})`);
  }
});

test("teaches task admission and completion using executable documentation sources", () => {
  const tutorial = read("quickstart");
  for (const path of [
    "examples/commerce/src/orders/tasks/export-orders.task.ts",
    "examples/commerce/src/orders/jobs/export-orders.job.ts",
    "examples/commerce/src/routes/orders/export/route.ts",
  ]) {
    expect(tutorial).toContain(`../../${path}`);
  }
  expect(tutorial).toContain("RunHandle");
  expect(tutorial).toContain("bun run check");
  expect(tutorial).toContain("bun run typecheck");
  expect(read("migration")).toContain("task-first definition");
});

test("states current retry, overlap, and provider limits without exactly-once promises", () => {
  expect(read("retries-and-idempotency")).toContain("three attempts");
  expect(read("retries-and-idempotency")).toContain("cannot multiply");
  expect(read("schedules")).toContain("provider accepted a write");
  expect(read("schedules")).toContain("does not cancel runs already accepted");
  expect(read("providers")).toContain("Managed cloud evidence");
});
