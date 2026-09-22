import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
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
  expect(guideRelations.find(({ path }) => path === "events/first-event")?.next).toBeUndefined();
  expect(renderRelated(guideRelations.find(({ path }) => path === "events/first-event")!)).not.toContain("Next step");
  expect(guideRelations.find(({ path }) => path === "jobs/troubleshooting")?.next).toBeUndefined();
  expect(features.find(({ id }) => id === "jobs")?.guide).toBe("jobs/quickstart");
  expect(features.find(({ id }) => id === "schedules")?.guide).toBe("jobs/schedules");
  for (const page of jobsGuideGroup.pages) {
    const source = read(page);
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

test("provider guides show configuration, real input, registration, and native run evidence", () => {
  for (const provider of ["inngest", "effect-mq", "trigger"]) {
    const page = read(`providers/${provider}`);
    expect(page).toContain(`providers/${provider}-config.ts`);
    expect(page).toContain(`providers/${provider}-task.ts`);
    expect(page).toContain("providers/export-orders.json");
    expect(page).toContain("jobs list");
    expect(page).toContain("jobs runs get --run-id");
  }
  expect(read("providers/inngest")).toContain("run.status");
  expect(read("providers/effect-mq")).toContain("from effect_mq");
  expect(read("providers/trigger")).toContain("no proof");
  for (const screenshot of [
    "jobs-inngest-registered.png",
    "jobs-inngest-completed.png",
    "jobs-effect-mq-completed.png",
  ]) {
    expect(existsSync(resolve(content, `../../public/${screenshot}`))).toBe(true);
    expect(read(`providers/${screenshot.includes("effect") ? "effect-mq" : "inngest"}`)).toContain(
      `/${screenshot}`,
    );
  }
  expect(read("providers/trigger")).toContain("No screenshot of a completed native run");
});
