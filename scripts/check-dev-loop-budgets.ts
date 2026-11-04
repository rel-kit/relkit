/**
 * The development-loop budget gate. Reads a benchmark report, judges it against the current
 * budgets (not the verdict stored in the file), prints every size's numbers and the host,
 * and exits non-zero with one line per missed budget. Release readiness runs it after the
 * benchmark; `scripts/tests/fixtures/dev-loop-injected-delay.json` is a report whose
 * 100-function reload was slowed on purpose and must fail it.
 *
 * Usage: bun scripts/check-dev-loop-budgets.ts --report <report.json>
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mebibytes, reportViolations } from "./dev-loop-benchmark/budgets.js";
import type { DevLoopReport } from "./dev-loop-benchmark/benchmark.types.js";

/**
 * Prints the report and its verdict.
 * @param path - Report file.
 * @returns Exit code: 0 when every budget holds.
 */
export function checkDevLoopBudgets(path: string): number {
  const report = JSON.parse(readFileSync(path, "utf8")) as DevLoopReport;
  const host = report.host;
  console.log(
    `Host: ${host.runner}, ${host.cpu ?? "unknown CPU"} (${host.cpus} cores), ${host.platform} ${host.arch}, Bun ${host.bun}`,
  );
  for (const size of report.sizes)
    console.log(
      `${size.functions} functions: reload p95 ${size.reload.p95Ms.toFixed(1)} ms; check ${mebibytes(size.check.peakBytes)} vs tsc ${mebibytes(size.tsc.peakBytes)} (${size.memoryRatio.toFixed(2)}×)`,
    );
  const violations = reportViolations(report);
  for (const violation of violations) console.error(`Budget missed: ${violation.message}`);
  if (violations.length === 0) console.log("Every development-loop budget holds.");
  return violations.length === 0 ? 0 : 1;
}

if (import.meta.main) {
  const index = process.argv.indexOf("--report");
  const report = index < 0 ? undefined : process.argv[index + 1];
  if (report === undefined) {
    console.error("Usage: bun scripts/check-dev-loop-budgets.ts --report <report.json>");
    process.exit(2);
  }
  process.exit(checkDevLoopBudgets(resolve(report)));
}
