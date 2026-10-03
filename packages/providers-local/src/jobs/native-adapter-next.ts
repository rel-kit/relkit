import { nativeNow } from "../native-services.js";
import type {
  NativeTaskWork,
  OperationContext,
  TaskExecutionBinding,
  TaskExecutionEnvelope,
} from "@relkit/jobs/adapter";
import { isSleepSuspension, sameNamespace, sleepSuspension } from "./native-adapter-support.js";
import type { LocalNativeState } from "./native-adapter-types.js";

/** Claims the first eligible scoped run and constructs its execution binding and sleep checkpoints.
 * @param state - Current service-owned state.
 * @param context - Caller scope, cancellation and operation metadata.
 * @returns The claimed task work, or undefined when no eligible work is available.
 */
export async function nextRun(
  state: LocalNativeState,
  context: OperationContext,
): Promise<NativeTaskWork | undefined> {
  const run = [...state.runs.values()].find(
    (candidate) =>
      sameNamespace(candidate, context) &&
      (candidate.status === "queued" || candidate.status === "sleeping") &&
      due(candidate),
  );
  if (run === undefined || context.signal.aborted) return undefined;
  const controller = new AbortController();
  run.status = "running";
  run.startedAt = new Date(nativeNow()).toISOString();
  const scheduledFor = run.nextEligibleAt ?? run.request.scheduledFor;
  delete run.nextEligibleAt;
  run.controller = controller;
  /**
   * Forwards caller cancellation to the active native attempt controller.
   * @returns Nothing; cancellation listeners are removed when the attempt settles.
   */
  const abort = (): void => controller.abort(context.signal.reason);
  context.signal.addEventListener("abort", abort, { once: true });
  run.controllerCleanup = () => context.signal.removeEventListener("abort", abort);
  if (context.signal.aborted) abort();
  const envelope: TaskExecutionEnvelope = {
    runId: run.runId,
    jobId: run.request.jobId,
    taskId: run.request.taskId,
    taskVersion: run.request.taskVersion,
    buildId: run.request.buildId,
    input: run.canonicalInput,
    ...(run.request.inputHash === undefined ? {} : { inputHash: run.request.inputHash }),
    ...(run.request.inputSchemaHash === undefined
      ? {}
      : { inputSchemaHash: run.request.inputSchemaHash }),
    acceptedAt: run.acceptedAt,
    ...(scheduledFor === undefined ? {} : { scheduledFor }),
    attempt: run.attempt,
    ...(run.request.parentRunId === undefined ? {} : { parentRunId: run.request.parentRunId }),
    ...(run.request.scope === undefined ? {} : { scope: run.request.scope }),
    ...(run.request.acceptanceIdentity === undefined
      ? {}
      : { acceptanceIdentity: run.request.acceptanceIdentity }),
    ...(run.request.occurrenceIdentity === undefined
      ? {}
      : { occurrenceIdentity: run.request.occurrenceIdentity }),
    ...(run.request.propagation === undefined ? {} : { propagation: run.request.propagation }),
  };
  const binding: TaskExecutionBinding = {
    run: {
      runId: run.runId,
      jobId: run.request.jobId,
      taskId: run.request.taskId,
      taskVersion: run.request.taskVersion,
      buildId: run.request.buildId,
      service: context.service,
      serviceGeneration: context.serviceGeneration,
      attempt: run.attempt,
      acceptedAt: run.acceptedAt,
      ...(run.request.parentRunId === undefined ? {} : { parentRunId: run.request.parentRunId }),
      ...(run.request.inputSchemaHash === undefined
        ? {}
        : { inputSchemaHash: run.request.inputSchemaHash }),
      scope: run.request.scope ?? context.scope,
      ...(run.request.acceptanceIdentity === undefined
        ? {}
        : { acceptanceIdentity: run.request.acceptanceIdentity }),
      ...(run.request.occurrenceIdentity === undefined
        ? {}
        : { occurrenceIdentity: run.request.occurrenceIdentity }),
      ...(run.request.propagation === undefined ? {} : { propagation: run.request.propagation }),
    },
    signal: controller.signal,
    isSuspension: isSleepSuspension,
    sleep: {
      sleep: async (key, durationMs) => {
        if (run.completedSleeps.has(key)) return;
        if (!Number.isSafeInteger(durationMs) || durationMs < 0 || key.trim() === "")
          throw new TypeError("Local durable sleep requires a non-empty key and safe duration");
        const wakeAt = new Date(nativeNow() + durationMs).toISOString();
        if (Date.parse(wakeAt) <= nativeNow()) return;
        throw sleepSuspension(key, wakeAt);
      },
      sleepUntil: async (key, instant) => {
        if (run.completedSleeps.has(key)) return;
        if (key.trim() === "" || !Number.isFinite(Date.parse(instant)))
          throw new TypeError("Local durable sleepUntil requires a non-empty key and instant");
        if (Date.parse(instant) <= nativeNow()) return;
        throw sleepSuspension(key, instant);
      },
    },
  };
  return { envelope, binding };
}

/** Checks the persisted next-eligible or scheduled instant against the owning clock.
 * @param run - Current persisted native or agent run.
 * @returns Whether the run is currently eligible for execution.
 */
function due(run: {
  readonly nextEligibleAt?: string;
  readonly request: { readonly scheduledFor?: string };
}): boolean {
  const value = run.nextEligibleAt ?? run.request.scheduledFor;
  return value === undefined || Date.parse(value) <= nativeNow();
}
