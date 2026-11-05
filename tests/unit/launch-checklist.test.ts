/** Checks the launch checklist: items read the metrics report, report mode never fails the run and strict mode does while items are open. */
import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { POSITIONING } from "../../scripts/positioning.ts";
import { buildMetricsReport } from "../../scripts/metrics.ts";
import { checklistMarkdown } from "../../scripts/launch/checklist.ts";
import { evaluateChecklist } from "../../scripts/launch/checklist-items.ts";

const root = resolve(import.meta.dir, "../..");
const fixtures = resolve(import.meta.dir, "../fixtures/metrics");
const at = "2026-11-05T12:00:00.000Z";
const ready = { hasDiscussionsEnabled: true, description: POSITIONING, goodFirstIssues: 10 };

test("every item is done when the metrics, files and GitHub state are ready", async () => {
  const report = buildMetricsReport(resolve(fixtures, "complete"), at, undefined);
  const items = await evaluateChecklist(root, report, ready);
  expect(items.filter((entry) => entry.status === "open")).toEqual([]);
  expect(items.map((entry) => entry.group)).toEqual([
    "p0",
    "p0",
    "p0",
    "p0",
    "p0",
    "railway",
    "community",
    "community",
    "community",
    "roadmap",
  ]);
});

test("without metrics or GitHub, the metric and community items stay open with the reason", async () => {
  const items = await evaluateChecklist(root, undefined, undefined);
  const open = items.filter((entry) => entry.status === "open").map((entry) => entry.id);
  expect(open).toEqual([
    "p0-create",
    "railway-15-minutes",
    "community-discussions",
    "community-description",
    "community-good-first-issues",
  ]);
  expect(items.find((entry) => entry.id === "railway-15-minutes")?.detail).toContain(
    "No metrics report",
  );
});

test("a Railway newcomer time over 15 minutes keeps the item open", async () => {
  const report = buildMetricsReport(resolve(fixtures, "complete"), at, undefined);
  const slow = {
    ...report,
    metrics: report.metrics.map((metric) =>
      metric.id === "time-to-railway"
        ? { ...metric, status: "not-met" as const, value: "16 min", numeric: 960 }
        : metric,
    ),
  };
  const items = await evaluateChecklist(root, slow, ready);
  expect(items.find((entry) => entry.id === "railway-15-minutes")?.status).toBe("open");
});

test("the markdown names the mode and counts open items", async () => {
  const items = await evaluateChecklist(root, undefined, undefined);
  expect(checklistMarkdown(items, false)).toContain(
    "Report mode: 5 of 10 items are open; this does not fail the run.",
  );
  expect(checklistMarkdown(items, true)).toContain(
    "Strict mode: 5 of 10 items are open, so the launch is blocked.",
  );
});

test("report mode exits 0 with open items and strict mode exits 1", async () => {
  const run = async (...flags: string[]) =>
    await Bun.spawn(["bun", "scripts/launch/checklist.ts", "--metrics", "missing.json", ...flags], {
      cwd: root,
      stdout: "ignore",
      stderr: "ignore",
    }).exited;
  expect(await run()).toBe(0);
  expect(await run("--strict")).toBe(1);
});
