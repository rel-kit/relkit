/** Checks the plan metrics: values and targets from CI outputs, "no data" for missing outputs, the page rendering and the CI result files. */
import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildMetricsReport } from "../../scripts/metrics.ts";
import { countPackages } from "../../scripts/metrics/evaluate.ts";
import { countOutsideContributions } from "../../scripts/metrics/contributions.ts";
import { metricsMarkdown, readMetricsReport } from "../../scripts/metrics/render.ts";
import { resultFor } from "../../scripts/metrics/write-result.ts";

const root = resolve(import.meta.dir, "../..");
const fixtures = resolve(import.meta.dir, "../fixtures/metrics");
const at = "2026-11-05T12:00:00.000Z";

test("a complete set of CI outputs meets every plan target", () => {
  const report = buildMetricsReport(join(fixtures, "complete"), at, "abc123def456abc");
  const byId = new Map(report.metrics.map((metric) => [metric.id, metric]));
  expect(report.metrics.map((metric) => metric.id)).toEqual([
    "creation-success",
    "time-to-first-route",
    "time-to-railway",
    "runtimes-http",
    "reload-p95",
    "check-memory",
    "agent-eval-pass-rate",
    "outside-contributions",
    "published-packages",
  ]);
  expect(byId.get("creation-success")).toMatchObject({ value: "5 of 5 templates", numeric: 100 });
  expect(byId.get("time-to-first-route")).toMatchObject({ value: "3 min 32 s", numeric: 212 });
  expect(byId.get("time-to-railway")).toMatchObject({ value: "10 min 40 s", status: "met" });
  expect(byId.get("runtimes-http")?.value).toBe("Bun 1.3.10, Node 22, Node 24");
  expect(byId.get("reload-p95")).toMatchObject({ value: "610 ms", status: "met" });
  expect(byId.get("check-memory")).toMatchObject({ value: "0.91×", status: "met" });
  expect(byId.get("agent-eval-pass-rate")?.value).toBe("66.7% (4 of 6 runs)");
  expect(byId.get("outside-contributions")).toMatchObject({ numeric: 12, status: "met" });
  for (const metric of report.metrics) expect(metric.target).not.toBe("");
  // The workspace itself is always measured, so the count never depends on a CI output.
  expect(byId.get("published-packages")?.numeric).toBeGreaterThan(0);
});

test("a metric whose output is missing shows no data instead of failing", () => {
  const report = buildMetricsReport(join(fixtures, "does-not-exist"), at, undefined);
  const missing = report.metrics.filter((metric) => metric.status === "no-data");
  expect(missing).toHaveLength(8);
  expect(missing.every((metric) => metric.value === "no data" && metric.numeric === null)).toBe(
    true,
  );
  expect(report.metrics.find((metric) => metric.id === "published-packages")?.status).not.toBe(
    "no-data",
  );
});

test("failures, stubbed walkthroughs and unreadable files are reported, not thrown", () => {
  const report = buildMetricsReport(join(fixtures, "partial"), at, undefined);
  const byId = new Map(report.metrics.map((metric) => [metric.id, metric]));
  expect(byId.get("creation-success")).toMatchObject({
    status: "not-met",
    value: "1 of 5 templates",
  });
  expect(byId.get("creation-success")?.detail).toContain("failing: api");
  expect(byId.get("runtimes-http")).toMatchObject({ status: "not-met", value: "Bun 1.3.10" });
  expect(byId.get("time-to-railway")).toMatchObject({ status: "no-data", value: "no data" });
  expect(byId.get("time-to-railway")?.detail).toContain("not signed in");
  expect(byId.get("reload-p95")?.status).toBe("no-data");
});

test("the metrics table lists current value, target and status for each metric", () => {
  const report = buildMetricsReport(join(fixtures, "partial"), at, "abc123def456abc");
  const markdown = metricsMarkdown(report);
  expect(markdown).toContain("| Metric | Current | Target | Status | Source |");
  expect(markdown).toContain(
    "| Time from `create` to an app deployed on Railway | no data | Under 15 min | No data |",
  );
  expect(markdown).toContain("at commit `abc123def456`");
  expect(markdown).toContain('metrics show "no data"');
});

test("the checked-in docs fallback is a valid report with this workspace's package count", () => {
  const fallback = readMetricsReport(resolve(root, "apps/docs/data/metrics.json"));
  const counts = countPackages(root);
  expect(fallback.metrics.find((metric) => metric.id === "published-packages")?.numeric).toBe(
    counts.firstParty + counts.integrations + counts.unclassified.length,
  );
});

test("CI result files carry the protocol the report reads", () => {
  expect(
    resultFor(
      [
        "creation-canary",
        "--template",
        "api",
        "--outcome",
        "cancelled",
        "--bun",
        "1.3.10",
        "--source",
        "candidate",
      ],
      at,
    ),
  ).toMatchObject({ protocol: "relkit.creation-canary-result", outcome: "failure" });
  expect(
    resultFor(
      ["runtime-http", "--runtime", "node", "--version", "v22.1.0", "--outcome", "success"],
      at,
    ),
  ).toMatchObject({ protocol: "relkit.runtime-http-result", runtime: "node", outcome: "success" });
  expect(() => resultFor(["other"], at)).toThrow("creation-canary or runtime-http");
});

test("outside contributions exclude members, bots and older records", () => {
  const now = new Date(at);
  const record = (created_at: string, author_association: string, type = "User") => ({
    created_at,
    author_association,
    user: { type },
  });
  const result = countOutsideContributions(
    [
      record("2026-11-01T00:00:00Z", "NONE"),
      record("2026-10-20T00:00:00Z", "FIRST_TIME_CONTRIBUTOR"),
      record("2026-11-02T00:00:00Z", "MEMBER"),
      record("2026-11-02T00:00:00Z", "NONE", "Bot"),
      record("2026-09-01T00:00:00Z", "NONE"),
    ],
    30,
    now,
  );
  expect(result.count).toBe(2);
});

test("the inputs directory may be any depth of downloaded artifacts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "relkit-metrics-"));
  try {
    await Bun.$`mkdir -p ${join(directory, "a/b")}`;
    await writeFile(
      join(directory, "a/b/x.json"),
      JSON.stringify({ runs: 3, passed: 1, passRate: 33.3 }),
    );
    const report = buildMetricsReport(directory, at, undefined);
    expect(report.metrics.find((metric) => metric.id === "agent-eval-pass-rate")?.value).toBe(
      "33.3% (1 of 3 runs)",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
