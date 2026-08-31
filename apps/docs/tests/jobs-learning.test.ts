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
  expect(guideGroups.map(({ directory }) => directory).slice(0, 6)).toEqual([
    "start",
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
  expect(readFileSync(resolve(content, "async/jobs.mdx"), "utf8")).toContain("](/docs/jobs)");
  expect(readFileSync(resolve(content, "async/schedules.mdx"), "utf8")).toContain(
    "](/docs/jobs/schedules)",
  );
});

test("teaches receipt admission and completion using a tested producer and job harness", () => {
  const tutorial = read("first-job");
  for (const path of [
    "src/receipts/functions/send-receipt.function.ts",
    "src/receipts/jobs/send-receipt.job.ts",
    "src/receipts/service.ts",
    "tests/fixtures/queue-receipt.function.ts",
    "tests/jobs.test.ts",
  ]) {
    expect(tutorial).toContain(`../../examples/commerce/${path}`);
  }
  expect(tutorial).toContain("existing RELKIT app");
  expect(tutorial).toContain("bun test tests/jobs.test.ts");
  expect(tutorial).toContain("bun run check");
  expect(tutorial).toContain("bun run typecheck");
  expect(tutorial).toContain("RELKIT_ENV=test bun run dev");
  expect(tutorial).toContain("**Invoke locally**");
  expect(read("define")).toContain("relkit.config.ts#jobs-profile");
  expect(read("define")).toContain("platform/env.ts#jobs-environment");
});

test("states current retry, overlap, and provider limits without exactly-once promises", () => {
  expect(read("enqueue")).toContain("It does not wait for the target");
  expect(read("retries")).toContain("not** automatically retry every thrown exception");
  expect(read("retries")).toContain(
    "does not itself move that message into a durable separate dead-letter queue",
  );
  expect(read("idempotency")).toContain("SQS adapter does not enforce");
  expect(read("schedules")).toContain("**enqueue callback**");
  expect(read("schedules")).toContain("does not guarantee catch-up across downtime");
  expect(read("schedules")).toContain("does not automatically register the descriptor's schedules");
});
