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
  expect(guideRelations.find(({ path }) => path === "jobs/first-job")?.next).toBe("database/index");
  expect(features.find(({ id }) => id === "jobs")?.guide).toBe("jobs/define");
  expect(features.find(({ id }) => id === "schedules")?.guide).toBe("jobs/schedules");
  for (const page of jobsGuideGroup.pages) {
    const source = read(page);
    expect((source.match(/^## .+$/gm) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(source).toMatch(/<include[^>]*lang="ts"/);
    expect(source).toContain(`content/generated/related/jobs-${page}.mdx`);
    if (page !== "index") expect(read("index")).toContain(`](/docs/jobs/${page})`);
  }
});

test("teaches receipt admission and completion using executable documentation sources", () => {
  const tutorial = read("first-job");
  for (const path of [
    "apps/docs/examples/jobs/send-receipt.function.ts",
    "apps/docs/examples/jobs/send-receipt.job.ts",
    "apps/docs/examples/jobs/queue-receipt.function.ts",
    "packages/testing/jobs.test.ts",
  ]) {
    expect(tutorial).toContain(`../../${path}`);
  }
  expect(tutorial).toContain("existing RELKIT app");
  expect(tutorial).toContain("bun test");
  expect(tutorial).toContain("bun run check");
  expect(tutorial).toContain("bun run typecheck");
  expect(tutorial).toContain("No `RELKIT_ENV` value installs a hidden queue");
  expect(read("define")).toContain("singular `job`");
  expect(read("define")).toContain("named binding references");
});

test("states current retry, overlap, and provider limits without exactly-once promises", () => {
  expect(read("enqueue")).toContain("It does not wait for the target");
  expect(read("retries")).toContain("not** automatically retry every thrown exception");
  expect(read("retries")).toContain(
    "Production retention, replay, and dead-letter behavior belong to the selected integration",
  );
  expect(read("idempotency")).toMatch(/selected production\s+integration/);
  expect(read("schedules")).toContain("**enqueue callback**");
  expect(read("schedules")).toContain("does not guarantee catch-up across downtime");
  expect(read("schedules")).toContain("does not automatically register the descriptor's schedules");
});
