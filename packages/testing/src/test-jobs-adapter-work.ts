import type { RunHandle, RunListQuery, RunPage, RunSnapshot, RunWatchFrame } from "@relkit/contracts/jobs";
import type {
  NativeRunQuery,
  NativeTaskWork,
  NativeWatchRequest,
  OperationContext,
  NativeSubmission,
  TaskExecutionBinding,
  TaskExecutionEnvelope,
} from "@relkit/jobs/adapter";
import type { TestClock } from "./runtime.js";
import { failureOf, isTerminal, snapshotOf, type TestNativeRun } from "./test-jobs-adapter-support.js";

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

export function list(
  runs: Map<string, TestNativeRun>,
  query: NativeRunQuery,
  service: string,
): RunPage<RunSnapshot> {
  const items = [...runs.values()]
    .filter((run) => matches(run, query))
    .slice(0, query.limit ?? 25)
    .map((run) => snapshotOf(run, service));
  return {
    items,
    hasMore: false,
    availability: [{ service, state: "available" }],
    count: { value: items.length, accuracy: "exact" },
  };
}

export async function* observe(
  runs: Map<string, TestNativeRun>,
  request: NativeWatchRequest,
  context: OperationContext,
  service: string,
): AsyncIterable<RunWatchFrame<RunSnapshot>> {
  const run = runs.get(request.runId);
  if (run === undefined) throw new Error("Test run was not found");
  let sequence = 0;
  yield {
    kind: "snapshot",
    run: snapshotOf(run, service),
    observedAt: new Date().toISOString(),
    epoch: "test",
    sequence: ++sequence,
    continuity: "state",
  };
  while (!isTerminal(run.status)) {
    if (context.signal.aborted) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    yield {
      kind: "update",
      run: snapshotOf(run, service),
      observedAt: new Date().toISOString(),
      epoch: "test",
      sequence: ++sequence,
    };
  }
}

export async function next(
  runs: Map<string, TestNativeRun>,
  context: OperationContext,
  service: string,
): Promise<NativeTaskWork | undefined> {
  const run = [...runs.values()].find((candidate) => candidate.status === "queued");
  if (run === undefined || context.signal.aborted) return undefined;
  const controller = new AbortController();
  run.status = "running";
  run.startedAt = new Date().toISOString();
  run.controller = controller;
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
    attempt: run.attempt,
    ...(run.request.scope === undefined ? {} : { scope: run.request.scope }),
    ...(run.request.acceptanceIdentity === undefined ? {} : { acceptanceIdentity: run.request.acceptanceIdentity }),
    ...(run.request.occurrenceIdentity === undefined ? {} : { occurrenceIdentity: run.request.occurrenceIdentity }),
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
      ...(run.request.inputSchemaHash === undefined ? {} : { inputSchemaHash: run.request.inputSchemaHash }),
      ...(run.request.acceptanceIdentity === undefined ? {} : { acceptanceIdentity: run.request.acceptanceIdentity }),
      ...(run.request.occurrenceIdentity === undefined ? {} : { occurrenceIdentity: run.request.occurrenceIdentity }),
    },
    signal: controller.signal,
  };
  return { envelope, binding };
}

export async function complete(run: TestNativeRun | undefined, output: unknown, clock: TestClock): Promise<void> {
  if (run === undefined || isTerminal(run.status)) return;
  run.status = "completed";
  run.output = output;
  run.completedAt = clock.now().toISOString();
}

export async function fail(run: TestNativeRun | undefined, error: unknown, clock: TestClock): Promise<void> {
  if (run === undefined || isTerminal(run.status)) return;
  run.status = "failed";
  run.error = failureOf(error);
  run.completedAt = clock.now().toISOString();
}

function matches(run: TestNativeRun, query: RunListQuery): boolean {
  return (query.runId === undefined || query.runId === run.runId) &&
    (query.jobId === undefined || query.jobId === run.request.jobId) &&
    (query.taskId === undefined || query.taskId === run.request.taskId) &&
    (query.status === undefined || query.status.includes(run.status));
}
