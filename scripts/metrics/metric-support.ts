/** Shared pieces of the metric evaluators: plan limits, duration formatting and the "no data" result. */
import type { MetricResult } from "./types.js";

/** Plan limits the metrics compare against. */
export const TARGETS = {
  firstRouteSeconds: 300,
  railwaySeconds: 900,
  reloadP95Ms: 1000,
  memoryRatio: 1,
  contributionsPerMonth: 10,
  sizeFunctions: 100,
} as const;

export const NO_DATA = "no data";

/**
 * Formats a duration for people.
 * @param seconds - Whole seconds.
 * @returns For example `4 min 12 s`.
 */
export function duration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const rest = seconds % 60;
  return `${Math.floor(seconds / 60)} min${rest === 0 ? "" : ` ${rest} s`}`;
}

export function missing(
  id: MetricResult["id"],
  name: string,
  target: string,
  detail: string,
): MetricResult {
  return { id, name, target, status: "no-data", value: NO_DATA, numeric: null, detail };
}
