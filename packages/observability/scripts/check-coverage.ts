import { readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
interface CoverageMetric {
  readonly total: number;
  readonly covered: number;
}
interface FileCoverage {
  readonly lines: CoverageMetric;
  readonly functions: CoverageMetric;
}
const packageRoot = resolve(import.meta.dir, "..");
const sourceRoot = join(packageRoot, "src");
const report = (await Bun.file(
  "/tmp/relkit-observability-vitest-coverage/coverage-summary.json",
).json()) as Record<string, FileCoverage>;
const excluded = new Set([
  "index.ts",
  "local/index.ts",
  "model.ts",
  "model-shared.ts",
  "telemetry.ts",
]);
// The worker entrypoint has only a startup-failure callback; its IPC behavior
// is exercised through duckdb-worker-process.ts in the package tests.
const entrypoints = new Set(["local/duckdb-worker.ts"]);
const MINIMUM_LINE_PERCENT = 60;
const MINIMUM_FUNCTION_PERCENT = 50;
async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      if (entry.isDirectory() && ["dist", "node_modules"].includes(entry.name)) return [];
      const path = join(directory, entry.name);
      return entry.isDirectory() ? sourceFiles(path) : [path];
    }),
  );
  return nested.flat();
}
const missing: string[] = [];
const uncovered: string[] = [];
const weak: string[] = [];
const oversized: string[] = [];
const misplaced: string[] = [];
for (const path of await sourceFiles(packageRoot)) {
  const name = relative(packageRoot, path);
  if (!name.endsWith(".ts")) continue;
  if (name.endsWith(".test.ts") && !name.startsWith("tests/")) misplaced.push(name);
  const content = await Bun.file(path).text();
  const lines = content.split("\n").length - Number(content.endsWith("\n"));
  if (lines > 200) oversized.push(`${name} (${lines} lines)`);
}
for (const path of await sourceFiles(sourceRoot)) {
  const name = relative(sourceRoot, path);
  if (!name.endsWith(".ts") || name.endsWith(".types.ts") || excluded.has(name)) continue;
  const coverage = report[path];
  if (coverage === undefined) missing.push(name);
  else if (coverage.lines.total > 0 && coverage.lines.covered === 0) uncovered.push(name);
  else if (!entrypoints.has(name)) {
    const linePercent =
      coverage.lines.total === 0 ? 100 : (100 * coverage.lines.covered) / coverage.lines.total;
    const functionPercent =
      coverage.functions.total === 0
        ? 100
        : (100 * coverage.functions.covered) / coverage.functions.total;
    if (linePercent < MINIMUM_LINE_PERCENT || functionPercent < MINIMUM_FUNCTION_PERCENT)
      weak.push(
        `${name} (${linePercent.toFixed(1)}% lines, ${functionPercent.toFixed(1)}% functions)`,
      );
  }
}
if (missing.length || uncovered.length || weak.length || oversized.length || misplaced.length) {
  if (missing.length) console.error(`Missing source coverage: ${missing.join(", ")}`);
  if (uncovered.length) console.error(`Untested runtime modules: ${uncovered.join(", ")}`);
  if (weak.length) console.error(`Runtime modules below coverage floor: ${weak.join(", ")}`);
  if (oversized.length) console.error(`Oversized TypeScript files: ${oversized.join(", ")}`);
  if (misplaced.length) console.error(`Package tests outside tests/: ${misplaced.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("Runtime coverage, TypeScript file size, and test placement checks passed.");
}
