import type {
  NativeTaskWork,
  NativeWatchRequest,
  OperationContext,
  TaskExecutionBinding,
  TaskExecutionEnvelope,
} from "@relkit/jobs/adapter";
import {
  isSleepSuspension,
  sameNamespace,
  sleepSuspension,
  terminal,
  snapshotOf,
} from "./native-adapter-support.js";
import type { LocalNativeState } from "./native-adapter-types.js";

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
  run.startedAt = new Date().toISOString();
  const scheduledFor = run.nextEligibleAt ?? run.request.scheduledFor;
  delete run.nextEligibleAt;
  run.controller = controller;
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
        const wakeAt = new Date(Date.now() + durationMs).toISOString();
        if (Date.parse(wakeAt) <= Date.now()) return;
        throw sleepSuspension(key, wakeAt);
      },
      sleepUntil: async (key, instant) => {
        if (run.completedSleeps.has(key)) return;
        if (key.trim() === "" || !Number.isFinite(Date.parse(instant)))
          throw new TypeError("Local durable sleepUntil requires a non-empty key and instant");
        if (Date.parse(instant) <= Date.now()) return;
        throw sleepSuspension(key, instant);
      },
    },
  };
  return { envelope, binding };
}

function due(run: {
  readonly nextEligibleAt?: string;
  readonly request: { readonly scheduledFor?: string };
}): boolean {
  const value = run.nextEligibleAt ?? run.request.scheduledFor;
  return value === undefined || Date.parse(value) <= Date.now();
}
