/**
 * Benchmarks the development loop on generated applications with 10, 100 and 500 functions.
 * For each size it measures `relkit check` and plain `tsc` peak process-tree memory, then
 * save-to-serving latency under `relkit dev`, and writes one JSON report with the host,
 * every sample and the budget verdict. `--enforce` exits non-zero when a budget is missed;
 * release readiness uploads the report and the docs benchmarks page renders it.
 *
 * Usage: bun scripts/benchmark-dev-loop.ts [--sizes 10,100,500] [--saves 20]
 *   [--output test-results/dev-loop-benchmark/report.json] [--enforce] [--inject-delay-ms 0]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { generateBenchmarkApp } from "./dev-loop-benchmark/app-generator.js";
import { budgetViolations, DEV_LOOP_BUDGETS, mebibytes } from "./dev-loop-benchmark/budgets.js";
import { benchmarkHost } from "./dev-loop-benchmark/host.js";
import { measurePeakMemory } from "./dev-loop-benchmark/memory-measure.js";
import { measureReloads } from "./dev-loop-benchmark/reload-measure.js";
import type { DevLoopReport, SizeMeasurement } from "./dev-loop-benchmark/benchmark.types.js";

const root = resolve(import.meta.dir, "..");

/**
 * Reads one `--name value` option.
 * @param name - Flag name.
 * @param fallback - Value when the flag is absent.
 * @returns The supplied or default value.
 */
function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : (process.argv[index + 1] ?? fallback);
}

/**
 * Measures one application size.
 * @param functions - Number of functions.
 * @param appsRoot - Directory receiving generated applications.
 * @returns Memory and reload measurements.
 */
async function measureSize(functions: number, appsRoot: string): Promise<SizeMeasurement> {
  const app = generateBenchmarkApp(root, appsRoot, functions);
  const cli = join(root, "packages/cli/dist/bin.js");
  const environment = { ...process.env, NO_COLOR: "1" };
  const check = await measurePeakMemory([process.execPath, cli, "check"], app.root, environment);
  if (check.exitCode !== 0) throw new Error(`relkit check failed for ${functions} functions.`);
  const tscBin = join(app.root, "node_modules/typescript/bin/tsc");
  const tsc = await measurePeakMemory(
    [process.execPath, tscBin, "-p", "tsconfig.json"],
    app.root,
    environment,
  );
  if (tsc.exitCode !== 0) throw new Error(`tsc failed for ${functions} functions.`);
  const reload = await measureReloads(app, {
    cli,
    saves: Number(option("--saves", "20")),
    startDeadlineMs: 120_000,
    saveDeadlineMs: 60_000,
    injectDelayMs: Number(option("--inject-delay-ms", "0")),
  });
  return { functions, reload, check, tsc, memoryRatio: check.peakBytes / tsc.peakBytes };
}

/**
 * Prints one size's numbers.
 * @param size - Measurement to print.
 */
function printSize(size: SizeMeasurement): void {
  console.log(
    `${size.functions} functions: reload p95 ${size.reload.p95Ms.toFixed(1)} ms (median ${size.reload.medianMs.toFixed(1)} ms, first start ${size.reload.firstStartMs.toFixed(0)} ms); ` +
      `check ${mebibytes(size.check.peakBytes)} vs tsc ${mebibytes(size.tsc.peakBytes)} (${size.memoryRatio.toFixed(2)}×)`,
  );
}

/**
 * Runs every size, writes the report and applies the budgets.
 * @returns Process exit code.
 */
async function main(): Promise<number> {
  const sizes = option("--sizes", DEV_LOOP_BUDGETS.map((budget) => budget.functions).join(","))
    .split(",")
    .map(Number);
  const appsRoot = resolve(
    option("--apps-root", join(root, "test-results/dev-loop-benchmark/apps")),
  );
  const output = resolve(
    option("--output", join(root, "test-results/dev-loop-benchmark/report.json")),
  );
  const host = benchmarkHost();
  const measured: SizeMeasurement[] = [];
  for (const functions of sizes) {
    const size = await measureSize(functions, appsRoot);
    printSize(size);
    measured.push(size);
  }
  const violations = budgetViolations(measured, host);
  const report: DevLoopReport = {
    protocol: "relkit.dev-loop-benchmark",
    version: 1,
    createdAt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA ?? gitHead(),
    host,
    sizes: measured,
    budgets: DEV_LOOP_BUDGETS,
    violations,
    passed: violations.length === 0,
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Report: ${output}`);
  for (const violation of violations) console.error(violation.message);
  return process.argv.includes("--enforce") && violations.length > 0 ? 1 : 0;
}

/**
 * Reads the checked-out commit.
 * @returns Commit SHA, or undefined outside a Git checkout.
 */
function gitHead(): string | undefined {
  const result = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root });
  return result.exitCode === 0 ? result.stdout.toString().trim() : undefined;
}

if (import.meta.main) process.exit(await main());
