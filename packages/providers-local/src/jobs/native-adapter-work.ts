import { nativeNow, nativeRandom } from "../native-services.js";
import { canonicalJson } from "@relkit/contracts";
import { Effect } from "effect";
import { runLocal } from "../local-effect.js";
import type { RunSnapshot, RunWatchFrame } from "@relkit/contracts/jobs";
import type { NativeWatchRequest, OperationContext } from "@relkit/jobs/adapter";
import { durationToMillis } from "@relkit/jobs";
import {
  failureOf,
  isSleepSuspension,
  sameNamespace,
  snapshotOf,
  terminal,
} from "./native-adapter-support.js";
import type { LocalNativeRun, LocalNativeState } from "./native-adapter-types.js";
import { nextRun } from "./native-adapter-next.js";
export { nextRun } from "./native-adapter-next.js";

/** Polls the native run and emits an initial snapshot plus changed-state frames until terminal or aborted.
 * @param state - Current service-owned state.
 * @param request - Caller domain request.
 * @param context - Caller scope, cancellation and operation metadata.
 * @returns An async iterable of initial and changed-state snapshots.
 */
export async function* observeRun(
  state: LocalNativeState,
  request: NativeWatchRequest,
  context: OperationContext,
): AsyncIterable<RunWatchFrame<RunSnapshot>> {
  const run = state.runs.get(request.runId);
  if (run === undefined) throw new Error("Native run was not found");
  if (!sameNamespace(run, context)) throw new Error("Native run is outside the operation scope");
  let sequence = 0;
  let previous = canonicalJson(snapshotOf(run));
  yield {
    kind: "snapshot",
    run: snapshotOf(run),
    observedAt: new Date(nativeNow()).toISOString(),
    epoch: "local",
    sequence: ++sequence,
    continuity: "state",
  };
  while (!terminal(run.status)) {
    if (context.signal.aborted) return;
    await wait(10, context.signal);
    const current = canonicalJson(snapshotOf(run));
    if (current === previous) continue;
    previous = current;
    yield {
      kind: "update",
      run: snapshotOf(run),
      observedAt: new Date(nativeNow()).toISOString(),
      epoch: "local",
      sequence: ++sequence,
    };
  }
}

/** Settles an owned active native run and releases its cancellation listener.
 * @param state - Current service-owned state.
 * @param runId - Run identity within its namespace.
 * @param output - Task output to retain on successful completion.
 * @param context - Caller scope, cancellation and operation metadata.
 * @returns A Promise completing after the active run settles successfully.
 */
export async function completeRun(
  state: LocalNativeState,
  runId: string,
  output: unknown,
  context: OperationContext,
): Promise<void> {
  const run = state.runs.get(runId);
  if (run === undefined || terminal(run.status)) return;
  if (!sameNamespace(run, context)) throw new Error("Native run is outside the operation scope");
  run.controllerCleanup?.();
  delete run.controllerCleanup;
  run.status = "completed";
  run.output = output;
  run.completedAt = new Date(nativeNow()).toISOString();
}

/** Settles a native failure or schedules a policy-bounded retry, releasing the attempt listener.
 * @param state - Current service-owned state.
 * @param runId - Run identity within its namespace.
 * @param error - Failure value to normalize or audit.
 * @param context - Caller scope, cancellation and operation metadata.
 * @returns A Promise completing after failure or retry state is updated.
 */
export async function failRun(
  state: LocalNativeState,
  runId: string,
  error: unknown,
  context: OperationContext,
): Promise<void> {
  const run = state.runs.get(runId);
  if (run === undefined || terminal(run.status)) return;
  if (!sameNamespace(run, context)) throw new Error("Native run is outside the operation scope");
  const failure = failureOf(error);
  const delay = retryDelay(run, failure);
  run.controllerCleanup?.();
  delete run.controllerCleanup;
  if (delay !== undefined) {
    run.status = "queued";
    run.attempt += 1;
    run.nextEligibleAt = new Date(nativeNow() + delay).toISOString();
    delete run.error;
    delete run.completedAt;
    return;
  }
  run.status = "failed";
  run.error = failure;
  run.completedAt = new Date(nativeNow()).toISOString();
}

/** Persists the next wake instant and releases the completed attempt controller.
 * @param state - Current service-owned state.
 * @param runId - Run identity within its namespace.
 * @param value - Value to validate, normalize or project.
 * @param context - Caller scope, cancellation and operation metadata.
 * @returns A Promise completing after the durable sleep state is updated.
 */
export async function suspendRun(
  state: LocalNativeState,
  runId: string,
  value: unknown,
  context: OperationContext,
): Promise<void> {
  const run = state.runs.get(runId);
  if (run === undefined || terminal(run.status)) return;
  if (!sameNamespace(run, context)) throw new Error("Native run is outside the operation scope");
  if (!isSleepSuspension(value)) throw new TypeError("Local native suspension is invalid");
  run.completedSleeps.add(value.key);
  run.status = "sleeping";
  run.nextEligibleAt = value.wakeAt;
  run.controllerCleanup?.();
  delete run.controllerCleanup;
  delete run.controller;
}

/** Calculates native retry eligibility and jitter while honoring the failure minimum delay.
 * @param run - Current persisted native or agent run.
 * @param failure - Attempt failure to classify.
 * @returns The retry delay, or undefined when another attempt is forbidden.
 */
function retryDelay(
  run: LocalNativeRun,
  failure: ReturnType<typeof failureOf>,
): number | undefined {
  if (failure.retry === "never") return undefined;
  const policy = record(record(run.request.policy)?.retry);
  if (policy === undefined) return undefined;
  const maxAttempts = integer(policy.maxAttempts, 1);
  if (run.attempt >= maxAttempts) return undefined;
  const initial = durationMillis(policy.initialDelayMs ?? policy.initialDelay, 0);
  const maximum = durationMillis(policy.maxDelayMs ?? policy.maxDelay, initial);
  const factor =
    typeof policy.multiplier === "number"
      ? policy.multiplier
      : typeof policy.factor === "number"
        ? policy.factor
        : 1;
  const base = Math.min(
    maximum,
    initial * Math.pow(Math.max(1, factor), Math.max(0, run.attempt - 1)),
  );
  const jittered = policy.jitter === "full" ? Math.floor(nativeRandom() * (base + 1)) : base;
  return Math.max(failure.afterMs ?? 0, Math.floor(jittered));
}

/** Reads a supported retry duration or returns the policy fallback.
 * @param value - Value to validate, normalize or project.
 * @param fallback - Value used when the optional input is absent or invalid.
 * @returns The parsed duration or policy fallback.
 */
function durationMillis(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === "string") {
    try {
      return durationToMillis(value as never);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/** Reads a positive safe retry counter or returns the policy fallback.
 * @param value - Value to validate, normalize or project.
 * @param fallback - Value used when the optional input is absent or invalid.
 * @returns The positive safe integer or policy fallback.
 */
function integer(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : fallback;
}

/** Narrows an unknown object before reading optional retry policy fields.
 * @param value - Value to validate, normalize or project.
 * @returns The narrowed record, or undefined.
 */
function record(value: unknown): Record<string, any> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : undefined;
}

/** Waits using the owning Effect Clock and releases the timer when aborted.
 * @param milliseconds - Wait duration in milliseconds.
 * @param signal - Caller cancellation signal.
 * @returns A Promise completing after the clock delay or cancellation.
 */
function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return runLocal(Effect.sleep(milliseconds), signal).catch(() => undefined);
}
