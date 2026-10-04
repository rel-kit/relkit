import type { RunHandle, RunListQuery, RunPage, RunSnapshot } from "@relkit/contracts/jobs";
import type {
  NativeRunQuery,
  NativeTaskWork,
  OperationContext,
  NativeSubmission,
  TaskExecutionBinding,
  TaskExecutionEnvelope,
} from "@relkit/jobs/adapter";
import type { TestClock } from "./runtime.js";
import { combineSignals } from "./runtime-clock.js";
import {
  failureOf,
  isTerminal,
  snapshotOf,
  type TestNativeRun,
} from "./test-jobs-adapter-support.js";

/**
 * Creates one queued native run using an injected acceptance clock.
 * @param request - Native operation input carrying explicit identity and execution context.
 * @param runId - Accepted native run identity.
 * @param retryOfRunId - Optional retry ancestry identity.
 * @param clock - Injected deterministic domain clock.
 * @returns Authoritative run state with canonical input and explicit retry ancestry.
 */
export function createRun(
  request: NativeSubmission,
  runId: string,
  retryOfRunId: string | undefined,
  clock: TestClock,
): TestNativeRun {
  return {
    request,
    runId,
    acceptedAt: clock.now().toISOString(),
    status: "queued",
    attempt: 1,
    canonicalInput: request.canonicalInput ?? { version: 1, kind: "json", value: request.input },
    ...(retryOfRunId === undefined ? {} : { retryOfRunId }),
  };
}

/**
 * Projects the accepted native run identity.
 * @param run - Authoritative native run state.
 * @returns The existing accepted native handle.
 */
export function handle(run: TestNativeRun): RunHandle {
  return {
    accepted: true,
    runId: run.runId,
    jobId: run.request.jobId,
    taskId: run.request.taskId,
    taskVersion: run.request.taskVersion,
    acceptedAt: run.acceptedAt,
  };
}

/**
 * Filters native runs and returns detached deterministic snapshots.
 * @param runs - Authoritative native runs indexed by accepted identity.
 * @param query - Existing native run list filters.
 * @param service - Native service identity included in public run snapshots.
 * @param clock - Injected deterministic domain clock.
 * @returns The native page with explicit availability and count fields.
 */
export function list(
  runs: Map<string, TestNativeRun>,
  query: NativeRunQuery,
  service: string,
  clock: TestClock,
): RunPage<RunSnapshot> {
  const items = [...runs.values()]
    .filter((run) => matches(run, query))
    .slice(0, query.limit ?? 25)
    .map((run) => structuredClone(snapshotOf(run, service, clock)));
  return {
    items,
    hasMore: false,
    availability: [{ service, state: "available" }],
    count: { value: items.length, accuracy: "exact" },
  };
}

/**
 * Admits one queued native task and binds native cancellation.
 * @param runs - Authoritative native runs indexed by accepted identity.
 * @param context - Native invocation context including cancellation and deadline.
 * @param service - Native service identity included in public run snapshots.
 * @param clock - Injected deterministic domain clock.
 * @returns Work and execution binding, or undefined when admission finds no eligible task.
 */
export async function next(
  runs: Map<string, TestNativeRun>,
  context: OperationContext,
  service: string,
  clock: TestClock,
): Promise<NativeTaskWork | undefined> {
  const run = [...runs.values()].find((candidate) => candidate.status === "queued");
  if (run === undefined || context.signal.aborted) return undefined;
  const controller = new AbortController();
  run.status = "running";
  run.startedAt = clock.now().toISOString();
  run.controller = controller;
  const signal = combineSignals(controller.signal, context.signal);
  run.disposeSignal = signal.dispose;
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
    attempt: run.attempt,
    ...(run.request.scope === undefined ? {} : { scope: run.request.scope }),
    ...(run.request.acceptanceIdentity === undefined
      ? {}
      : { acceptanceIdentity: run.request.acceptanceIdentity }),
    ...(run.request.occurrenceIdentity === undefined
      ? {}
      : { occurrenceIdentity: run.request.occurrenceIdentity }),
  };
  const binding: TaskExecutionBinding = {
    run: {
      runId: run.runId,
      jobId: run.request.jobId,
      taskId: run.request.taskId,
      taskVersion: run.request.taskVersion,
      buildId: run.request.buildId,
      service,
      serviceGeneration: context.serviceGeneration,
      attempt: run.attempt,
      acceptedAt: run.acceptedAt,
      scope: run.request.scope ?? context.scope,
      ...(run.request.inputSchemaHash === undefined
        ? {}
        : { inputSchemaHash: run.request.inputSchemaHash }),
      ...(run.request.acceptanceIdentity === undefined
        ? {}
        : { acceptanceIdentity: run.request.acceptanceIdentity }),
      ...(run.request.occurrenceIdentity === undefined
        ? {}
        : { occurrenceIdentity: run.request.occurrenceIdentity }),
    },
    signal: signal.signal,
  };
  return { envelope, binding };
}

/**
 * Commits a nonterminal worker's successful native outcome.
 * @param run - Authoritative native run state.
 * @param output - Validated native worker result.
 * @param clock - Injected deterministic domain clock.
 * @returns Completion; terminal or absent runs remain unchanged.
 */
export async function complete(
  run: TestNativeRun | undefined,
  output: unknown,
  clock: TestClock,
): Promise<void> {
  if (run === undefined || isTerminal(run.status)) return;
  run.status = "completed";
  run.output = output;
  run.completedAt = clock.now().toISOString();
}

/**
 * Commits a nonterminal worker's bounded native failure envelope.
 * @param run - Authoritative native run state.
 * @param error - Original native worker failure.
 * @param clock - Injected deterministic domain clock.
 * @returns Completion; terminal or absent runs remain unchanged.
 */
export async function fail(
  run: TestNativeRun | undefined,
  error: unknown,
  clock: TestClock,
): Promise<void> {
  if (run === undefined || isTerminal(run.status)) return;
  run.status = "failed";
  run.error = failureOf(error);
  run.completedAt = clock.now().toISOString();
}

/**
 * Tests native job list filters without changing authoritative state.
 * @param run - Authoritative native run state.
 * @param query - Existing native run list filters.
 * @returns True when every supplied identity/status filter matches.
 */
function matches(run: TestNativeRun, query: RunListQuery): boolean {
  return (
    (query.runId === undefined || query.runId === run.runId) &&
    (query.jobId === undefined || query.jobId === run.request.jobId) &&
    (query.taskId === undefined || query.taskId === run.request.taskId) &&
    (query.status === undefined || query.status.includes(run.status))
  );
}
