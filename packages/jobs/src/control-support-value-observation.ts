import type { RunSnapshot } from "@relkit/contracts/jobs";
import { durationToMillis, type DurationInput } from "./duration.js";
import type { JobsRuntime } from "./runtime.js";

/** Tests whether a run has reached a terminal state.
 * @param run - Native run snapshot.
 * @returns True for completed, failed, cancelled, or timed-out runs.
 * @example isTerminal(snapshot);
 */
export function isTerminal(run: RunSnapshot): boolean {
  return (
    run.status === "completed" ||
    run.status === "failed" ||
    run.status === "cancelled" ||
    run.status === "timed-out"
  );
}

/** Resolves a bounded per-read observation timeout.
 * @param runtime - Jobs capability limits.
 * @param authored - Optional caller timeout override.
 * @returns Timeout in milliseconds, capped at ten seconds.
 * @throws RangeError for invalid or oversized timeouts.
 * @example observerTimeout(runtime, "2 seconds");
 */
export function observerTimeout(runtime: JobsRuntime, authored?: DurationInput): number {
  const timeoutMs =
    authored === undefined
      ? (runtime.capabilities.limits?.readTimeoutMs ?? 10_000)
      : durationToMillis(authored);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 10_000) {
    throw new RangeError("Observer timeout must be positive and no greater than 10 seconds");
  }
  return timeoutMs;
}
