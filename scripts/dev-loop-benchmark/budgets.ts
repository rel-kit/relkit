/**
 * Holds the development-loop budgets from the development-loop specification and judges a
 * report against them. Pure: callers read and write reports; this module only compares
 * numbers and describes each violation with the measured value, limit and host.
 */
import type {
  BenchmarkHost,
  BudgetViolation,
  DevLoopReport,
  SizeBudget,
  SizeMeasurement,
} from "./benchmark.types.js";

/** Save-to-serving p95 below 300 ms, 1 s and 2 s; check memory at most tsc, then 1.5×. */
export const DEV_LOOP_BUDGETS: readonly SizeBudget[] = Object.freeze([
  { functions: 10, reloadP95Ms: 300, memoryRatio: 1 },
  { functions: 100, reloadP95Ms: 1_000, memoryRatio: 1 },
  { functions: 500, reloadP95Ms: 2_000, memoryRatio: 1.5 },
]);

/**
 * Lists every budget a set of measurements misses.
 * @param sizes - Measurements, normally one per budgeted size.
 * @param host - Host recorded in each message.
 * @param budgets - Limits to apply.
 * @returns Violations in budget order; empty when every budget holds.
 */
export function budgetViolations(
  sizes: readonly SizeMeasurement[],
  host: BenchmarkHost,
  budgets: readonly SizeBudget[] = DEV_LOOP_BUDGETS,
): BudgetViolation[] {
  const where = `${host.platform}/${host.arch}, ${host.cpu ?? "unknown CPU"}, ${host.runner}`;
  return budgets.flatMap((budget): BudgetViolation[] => {
    const size = sizes.find((entry) => entry.functions === budget.functions);
    if (size === undefined)
      return [
        {
          functions: budget.functions,
          metric: "missing",
          measured: 0,
          limit: 0,
          message: `${budget.functions} functions: no measurement on ${where}.`,
        },
      ];
    const violations: BudgetViolation[] = [];
    if (!(size.reload.p95Ms < budget.reloadP95Ms))
      violations.push({
        functions: budget.functions,
        metric: "reload-p95",
        measured: size.reload.p95Ms,
        limit: budget.reloadP95Ms,
        message: `${budget.functions} functions: reload p95 ${size.reload.p95Ms.toFixed(1)} ms is not below ${budget.reloadP95Ms} ms on ${where}.`,
      });
    if (!(size.memoryRatio <= budget.memoryRatio))
      violations.push({
        functions: budget.functions,
        metric: "check-memory",
        measured: size.memoryRatio,
        limit: budget.memoryRatio,
        message: `${budget.functions} functions: relkit check peak ${mebibytes(size.check.peakBytes)} is ${size.memoryRatio.toFixed(2)}× tsc (${mebibytes(size.tsc.peakBytes)}), above ${budget.memoryRatio}× on ${where}.`,
      });
    return violations;
  });
}

/**
 * Re-judges a stored report, so a report file alone decides the CI gate.
 * @param report - Parsed benchmark report.
 * @returns Its violations under the current budgets.
 */
export function reportViolations(report: DevLoopReport): BudgetViolation[] {
  return budgetViolations(report.sizes, report.host);
}

/**
 * Formats bytes for messages.
 * @param bytes - Byte count.
 * @returns Mebibytes with one decimal.
 */
export function mebibytes(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MiB`;
}
