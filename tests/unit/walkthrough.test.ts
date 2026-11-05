/** Checks the newcomer walkthrough helpers: step timing, result files and reading the Railway newcomer outcome. */
import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildMetricsReport } from "../../scripts/metrics.ts";
import { failureReason, newcomerOutcome } from "../../scripts/walkthrough/create-to-railway.ts";
import { Stopwatch, writeWalkthroughResult } from "../../scripts/walkthrough/support.ts";

test("the Railway newcomer outcome is the last result line the test printed", () => {
  const output = [
    "Prepared /tmp/x in 41 s",
    "deployed after 120 s",
    '{"result":"passed","runtime":"bun","prepared":41,"timings":{"deployed":120,"reachable":150}}',
  ].join("\n");
  expect(newcomerOutcome(output)).toEqual({
    result: "passed",
    runtime: "bun",
    prepared: 41,
    timings: { deployed: 120, reachable: 150 },
  });
  expect(newcomerOutcome("Skipped the Railway newcomer deploy test")).toBeUndefined();
});

test("a walkthrough result written to disk feeds the metrics report", async () => {
  const directory = await mkdtemp(join(tmpdir(), "relkit-walkthrough-"));
  try {
    const clock = new Stopwatch();
    clock.lap("create");
    const result = await writeWalkthroughResult(join(directory, "nested/result.json"), {
      kind: "create-to-first-route",
      outcome: "passed",
      seconds: 95,
      steps: clock.steps,
      note: "test",
    });
    expect(JSON.parse(await readFile(join(directory, "nested/result.json"), "utf8"))).toEqual(
      result,
    );
    const metric = buildMetricsReport(directory, new Date().toISOString(), undefined).metrics.find(
      ({ id }) => id === "time-to-first-route",
    );
    expect(metric).toMatchObject({ value: "1 min 35 s", status: "met", numeric: 95 });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a walkthrough that ran only against the stub has no timing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "relkit-walkthrough-"));
  try {
    await writeWalkthroughResult(join(directory, "railway.json"), {
      kind: "create-to-railway",
      outcome: "stubbed",
      seconds: null,
      steps: [],
      note: "No live deploy.",
    });
    const metric = buildMetricsReport(directory, new Date().toISOString(), undefined).metrics.find(
      ({ id }) => id === "time-to-railway",
    );
    expect(metric).toMatchObject({ status: "no-data", value: "no data" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the failure reason prefers a RelKit error code and otherwise the last line", () => {
  const coded = [
    "building",
    "src/routes/hello/route.ts:5:14 - error RELKIT_ROUTE_MODULE_TYPE: Route export GET must be typed.",
    "Deploy failed",
    "Bun v1.3.10 (macOS arm64)",
  ].join("\n");
  expect(failureReason(coded)).toContain("RELKIT_ROUTE_MODULE_TYPE");
  expect(
    failureReason("building\nDeploy failed\n    at x (y.ts:1:1)\nBun v1.3.10 (macOS arm64)"),
  ).toBe("Deploy failed");
});
