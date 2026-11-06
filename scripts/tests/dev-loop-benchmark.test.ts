/**
 * Covers the development-loop benchmark's pure parts: application generation, the latency
 * summary, and the budget verdict, including the failure a slow reload must produce.
 */
import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { generateBenchmarkApp } from "../dev-loop-benchmark/app-generator.js";
import { budgetViolations, DEV_LOOP_BUDGETS } from "../dev-loop-benchmark/budgets.js";
import { summarize } from "../dev-loop-benchmark/reload-measure.js";
import type { BenchmarkHost, SizeMeasurement } from "../dev-loop-benchmark/benchmark.types.js";

const root = resolve(import.meta.dir, "../..");
const host: BenchmarkHost = {
  bun: "1.3.10",
  platform: "linux",
  arch: "x64",
  os: "6",
  cpu: "test CPU",
  cpus: 4,
  memoryBytes: 16 * 1_073_741_824,
  runner: "local",
};

/**
 * Builds one size measurement.
 * @param functions - Function count.
 * @param p95Ms - Reload p95.
 * @param memoryRatio - Check-to-tsc memory ratio.
 * @returns Measurement with the given values.
 */
function size(functions: number, p95Ms: number, memoryRatio: number): SizeMeasurement {
  return {
    functions,
    reload: { samplesMs: [p95Ms], medianMs: p95Ms, p95Ms, maximumMs: p95Ms, firstStartMs: 1 },
    check: { peakBytes: memoryRatio * 100, durationMs: 1, exitCode: 0 },
    tsc: { peakBytes: 100, durationMs: 1, exitCode: 0 },
    memoryRatio,
  };
}

test("generates one function, one route and ten-function services per size", () => {
  const apps = mkdtempSync(join(tmpdir(), "relkit-dev-loop-apps-"));
  try {
    const app = generateBenchmarkApp(root, apps, 25);
    expect(readdirSync(join(app.root, "src/routes"))).toHaveLength(25);
    expect(readdirSync(join(app.root, "src/services"))).toHaveLength(3);
    expect(readFileSync(join(app.root, app.editedFile), "utf8")).toContain('"f0 v0"');
    expect(existsSync(join(app.root, "node_modules/relkit/package.json"))).toBe(true);
  } finally {
    rmSync(apps, { recursive: true, force: true });
  }
});

test("summarizes latency with nearest-rank p95", () => {
  const summary = summarize(Array.from({ length: 20 }, (_, index) => index + 1));
  expect(summary.medianMs).toBe(10.5);
  expect(summary.p95Ms).toBe(19);
  expect(summary.maximumMs).toBe(20);
});

test("passes only when every size meets its reload and memory budget", () => {
  const passing = DEV_LOOP_BUDGETS.map((budget) =>
    size(budget.functions, budget.reloadP95Ms - 1, budget.memoryRatio),
  );
  expect(budgetViolations(passing, host)).toEqual([]);
  const slow = passing.map((entry) => (entry.functions === 100 ? size(100, 1_200, 0.9) : entry));
  const [violation] = budgetViolations(slow, host);
  expect(violation?.metric).toBe("reload-p95");
  expect(violation?.message).toContain("1200.0 ms is not below 1000 ms");
  expect(violation?.message).toContain("test CPU");
  expect(budgetViolations(passing.slice(0, 2), host)[0]?.metric).toBe("missing");
});

test("the budget gate fails on the injected-delay fixture and names the value and host", () => {
  const gate = Bun.spawnSync(
    [
      process.execPath,
      "scripts/check-dev-loop-budgets.ts",
      "--report",
      "scripts/tests/fixtures/dev-loop-injected-delay.json",
    ],
    { cwd: root },
  );
  expect(gate.exitCode).toBe(1);
  const stderr = gate.stderr.toString();
  expect(stderr).toContain("100 functions: reload p95 1450.0 ms is not below 1000 ms");
  expect(stderr).toContain("Injected-delay fixture");
  expect(stderr.match(/Budget missed/g)).toHaveLength(1);
});

test("the advisory gate turns a missed budget into a warning annotation and exits 0", () => {
  const gate = Bun.spawnSync(
    [
      process.execPath,
      "scripts/check-dev-loop-budgets.ts",
      "--advisory",
      "--report",
      "scripts/tests/fixtures/dev-loop-injected-delay.json",
    ],
    { cwd: root },
  );
  expect(gate.exitCode).toBe(0);
  expect(gate.stderr.toString()).toContain(
    "::warning::Budget missed: 100 functions: reload p95 1450.0 ms is not below 1000 ms",
  );
  expect(gate.stdout.toString()).toContain("1 budget(s) missed; advisory mode exits 0.");
});
