import type { RunSnapshot } from "@relkit/contracts/jobs";
import { Effect } from "effect";
import type { DurationInput } from "./duration.js";
import type { JobsRuntime } from "./runtime.js";
import {
  isTerminal as terminalValue,
  observerTimeout as timeoutValue,
  isRecord as recordValue,
} from "./control-support-value.js";
import { controlSupportEffect, runControlSupport } from "./control-support-run.js";
/** Tests whether a run is terminal in Effect.
 * @param run - Native run snapshot.
 * @returns True for a terminal status; no expected failure.
 * @example Effect.runSync(isTerminalEffect(run));
 */
export const isTerminalEffect = Effect.fn("Jobs.isTerminalRun")((run: RunSnapshot) =>
  controlSupportEffect("controlSupport.isTerminal", () => terminalValue(run)),
);
/** Synchronous terminal run status test.
 * @param run - Native run snapshot.
 * @returns True for a terminal status.
 * @example isTerminal(run);
 */
export function isTerminal(run: RunSnapshot): boolean {
  return runControlSupport(isTerminalEffect(run));
}
/** Computes a bounded native observation read timeout in Effect.
 * @param runtime - Jobs runtime with provider limits.
 * @param authored - Optional authored timeout.
 * @returns Timeout milliseconds or ControlSupportFailure.
 * @example Effect.runSync(observerTimeoutEffect(runtime));
 */
export const observerTimeoutEffect = Effect.fn("Jobs.observerTimeout")(
  (runtime: JobsRuntime, authored?: DurationInput) =>
    controlSupportEffect("controlSupport.timeout", () => timeoutValue(runtime, authored)),
);
/** Synchronous bounded native observation timeout.
 * @param runtime - Jobs runtime with provider limits.
 * @param authored - Optional authored timeout.
 * @returns Timeout milliseconds.
 * @throws RangeError for an unsafe duration.
 * @example observerTimeout(runtime);
 */
export function observerTimeout(runtime: JobsRuntime, authored?: DurationInput): number {
  return runControlSupport(observerTimeoutEffect(runtime, authored));
}
/** Tests for a nonarray record in Effect.
 * @param value - Untrusted candidate.
 * @returns True for a nonarray record; no expected failure.
 * @example Effect.runSync(isControlRecordEffect({ id: "run" }));
 */
export const isControlRecordEffect = Effect.fn("Jobs.isControlRecord")((value: unknown) =>
  controlSupportEffect("controlSupport.isRecord", () => recordValue(value)),
);
/** Synchronous nonarray record type guard.
 * @param value - Untrusted candidate.
 * @returns True for a nonarray record.
 * @example isRecord({ id: "run" });
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return runControlSupport(isControlRecordEffect(value));
}
