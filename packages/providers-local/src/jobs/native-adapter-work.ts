import { canonicalJson } from "@relkit/contracts";
import type { RunSnapshot, RunWatchFrame } from "@relkit/contracts/jobs";
import type {
  NativeTaskWork,
  NativeWatchRequest,
  OperationContext,
  TaskExecutionBinding,
  TaskExecutionEnvelope,
} from "@relkit/jobs/adapter";
import { durationToMillis } from "@relkit/jobs";
import {
  failureOf,
  isSleepSuspension,
  sameNamespace,
  sleepSuspension,
  snapshotOf,
  terminal,
} from "./native-adapter-support.js";
import type { LocalNativeRun, LocalNativeState } from "./native-adapter-types.js";

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
    observedAt: new Date().toISOString(),
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
      observedAt: new Date().toISOString(),
      epoch: "local",
      sequence: ++sequence,
    };
  }
}

export async function nextRun(
  state: LocalNativeState,
  context: OperationContext,
): Promise<NativeTaskWork | undefined> {
  const run = [...state.runs.values()].find((candidate) =>
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
    ...(run.request.inputSchemaHash === undefined ? {} : { inputSchemaHash: run.request.inputSchemaHash }),
    acceptedAt: run.acceptedAt,
    ...(scheduledFor === undefined ? {} : { scheduledFor }),
    attempt: run.attempt,
    ...(run.request.parentRunId === undefined ? {} : { parentRunId: run.request.parentRunId }),
    ...(run.request.scope === undefined ? {} : { scope: run.request.scope }),
    ...(run.request.acceptanceIdentity === undefined ? {} : { acceptanceIdentity: run.request.acceptanceIdentity }),
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
      ...(run.request.inputSchemaHash === undefined ? {} : { inputSchemaHash: run.request.inputSchemaHash }),
      scope: run.request.scope ?? context.scope,
      ...(run.request.acceptanceIdentity === undefined ? {} : { acceptanceIdentity: run.request.acceptanceIdentity }),
      ...(run.request.propagation === undefined ? {} : { propagation: run.request.propagation }),
    },
    signal: controller.signal,
    isSuspension: isSleepSuspension,
    sleep: {
      sleep: async (key, durationMs) => {
        if (run.completedSleeps.has(key)) return;
        if (!Number.isSafeInteger(durationMs) || durationMs < 0 || key.trim() === "") {
          throw new TypeError("Local durable sleep requires a non-empty key and safe duration");
        }
        const wakeAt = new Date(Date.now() + durationMs).toISOString();
        if (Date.parse(wakeAt) <= Date.now()) return;
        throw sleepSuspension(key, wakeAt);
      },
      sleepUntil: async (key, instant) => {
        if (run.completedSleeps.has(key)) return;
        if (key.trim() === "" || !Number.isFinite(Date.parse(instant))) {
          throw new TypeError("Local durable sleepUntil requires a non-empty key and instant");
        }
        if (Date.parse(instant) <= Date.now()) return;
        throw sleepSuspension(key, instant);
      },
    },
  };
  return { envelope, binding };
}

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
  run.completedAt = new Date().toISOString();
}

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
    run.nextEligibleAt = new Date(Date.now() + delay).toISOString();
    delete run.error;
    delete run.completedAt;
    return;
  }
  run.status = "failed";
  run.error = failure;
  run.completedAt = new Date().toISOString();
}

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

function due(run: LocalNativeRun): boolean {
  const value = run.nextEligibleAt ?? run.request.scheduledFor;
  return value === undefined || Date.parse(value) <= Date.now();
}

function retryDelay(run: LocalNativeRun, failure: ReturnType<typeof failureOf>): number | undefined {
  if (failure.retry === "never") return undefined;
  const policy = record(record(run.request.policy)?.retry);
  if (policy === undefined) return undefined;
  const maxAttempts = integer(policy.maxAttempts, 1);
  if (run.attempt >= maxAttempts) return undefined;
  const initial = durationMillis(policy.initialDelayMs ?? policy.initialDelay, 0);
  const maximum = durationMillis(policy.maxDelayMs ?? policy.maxDelay, initial);
  const factor = typeof policy.multiplier === "number"
    ? policy.multiplier
    : typeof policy.factor === "number" ? policy.factor : 1;
  const base = Math.min(maximum, initial * Math.pow(Math.max(1, factor), Math.max(0, run.attempt - 1)));
  const jittered = policy.jitter === "full" ? Math.floor(Math.random() * (base + 1)) : base;
  return Math.max(failure.afterMs ?? 0, Math.floor(jittered));
}

function durationMillis(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === "string") {
    try { return durationToMillis(value as never); } catch { return fallback; }
  }
  return fallback;
}

function integer(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : fallback;
}

function record(value: unknown): Record<string, any> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : undefined;
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
