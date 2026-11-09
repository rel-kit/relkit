/**
 * Shared runner and assertions of the RelKit conformance suites. The suites use no Node or Bun
 * built-ins, so the same cases run on Bun, Node and inside workerd.
 */
import type {
  ConformanceCaseResult,
  ConformanceHarness,
  ConformanceReport,
} from "./conformance.types.js";

export type * from "./conformance.types.js";

/** Returned by a case that the provider does not support. */
export const SKIPPED = "skipped" as const;

/**
 * Runs every case of a harness, one after another, and reports pass, fail or skip per case.
 * @param harness - A conformance harness, such as `createCacheConformanceHarness(...)`.
 * @param only - Case ids to run; every case when omitted.
 * @returns One result per case and whether all of them passed or were skipped.
 * @example
 * ```ts
 * import { runConformance } from "@relkit/testing/conformance";
 * import { createCacheConformanceHarness } from "@relkit/testing/cache-conformance";
 * import { createLocalCacheProvider } from "relkit/providers-local";
 *
 * const report = await runConformance(
 *   createCacheConformanceHarness({ create: (cacheId) => createLocalCacheProvider({ cacheId }) }),
 * );
 * console.log(report.passed, report.results.map((result) => `${result.id}: ${result.outcome}`));
 * ```
 */
export async function runConformance<Id extends string>(
  harness: ConformanceHarness<Id>,
  only?: readonly Id[],
): Promise<ConformanceReport> {
  const results: ConformanceCaseResult[] = [];
  for (const item of harness.cases) {
    if (only !== undefined && !only.includes(item.id)) continue;
    try {
      const outcome = await harness.run(item.id);
      results.push({ ...item, outcome: outcome === SKIPPED ? "skip" : "pass" });
    } catch (error) {
      results.push({ ...item, outcome: "fail", error: describe(error) });
    }
  }
  return Object.freeze({
    suite: harness.suite,
    results: Object.freeze(results),
    passed: results.every((result) => result.outcome !== "fail"),
  });
}

/**
 * Throws when a report has a failed case, naming every failure.
 * @param report - A report from `runConformance`.
 * @returns Nothing; throws an Error listing the failed cases.
 * @example
 * ```ts
 * import { assertConformance } from "@relkit/testing/conformance";
 *
 * assertConformance({ suite: "cache", results: [], passed: true });
 * ```
 */
export function assertConformance(report: ConformanceReport): void {
  const failed = report.results.filter((result) => result.outcome === "fail");
  if (failed.length === 0) return;
  const lines = failed.map((result) => `- ${result.id}: ${result.error ?? "failed"}`);
  throw new Error(`${report.suite} conformance failed:\n${lines.join("\n")}`);
}

/**
 * Builds a harness from a table of checks, one per case.
 * @param suite - Suite name used in failure messages.
 * @param cases - The suite's cases.
 * @param checks - One check per case id.
 * @returns The harness.
 */
export function conformanceHarness<Id extends string>(
  suite: string,
  cases: readonly { readonly id: Id; readonly description: string }[],
  checks: Readonly<Record<Id, () => Promise<void | "skipped">>>,
): ConformanceHarness<Id> {
  return Object.freeze({
    suite,
    cases,
    run: async (caseId: Id) => {
      const check = checks[caseId];
      if (check === undefined) throw new Error(`Unknown ${suite} conformance case "${caseId}".`);
      return check();
    },
  });
}

/**
 * Fails the current case when a condition does not hold.
 * @param condition - The expectation.
 * @param label - What was expected.
 * @param actual - The observed value, printed in the failure.
 */
export function check(condition: boolean, label: string, actual?: unknown): asserts condition {
  if (!condition) throw new Error(`${label}. Got ${show(actual)}`);
}

/**
 * Compares two JSON-compatible values structurally, ignoring object key order.
 * @param left - First value. @param right - Second value.
 * @returns True when both encode to the same canonical JSON.
 */
export function same(left: unknown, right: unknown): boolean {
  return show(left) === show(right);
}

/**
 * Expects an operation to reject.
 * @param operation - The operation.
 * @param label - What should have failed.
 * @returns Nothing; fails the case when the operation resolves.
 */
export async function rejects(operation: () => unknown, label: string): Promise<void> {
  let value: unknown;
  try {
    value = await operation();
  } catch {
    return;
  }
  throw new Error(`${label} should reject. Resolved ${show(value)}`);
}

/**
 * Polls until a condition holds or the timeout passes.
 * @param condition - Checked after each `step`. @param step - Work between checks.
 * @param timeoutMs - Time limit. @param label - What was awaited.
 */
export async function eventually(
  condition: () => boolean,
  step: () => Promise<unknown>,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`${label} within ${timeoutMs} ms`);
    await step();
    await delay(10);
  }
}

/** @param ms - Milliseconds. @returns A promise resolved after `ms`. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** @returns An already aborted signal. */
export function abortedSignal(): AbortSignal {
  const controller = new AbortController();
  controller.abort(new Error("conformance: cancelled"));
  return controller.signal;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function show(value: unknown): string {
  if (value instanceof Uint8Array) return `bytes(${[...value].join(",")})`;
  try {
    return JSON.stringify(sortKeys(value)) ?? String(value);
  } catch {
    return String(value);
  }
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
  );
}
