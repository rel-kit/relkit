import { randomUUID } from "node:crypto";
import type { RunHandle, RunListQuery, RunPage, RunSnapshot } from "@relkit/contracts/jobs";
import type { NativeRunQuery, NativeSubmission, OperationContext } from "@relkit/jobs/adapter";
import { namespaceOf, sameNamespace, snapshotOf } from "./native-adapter-support.js";
import type { LocalNativeRun, LocalNativeState } from "./native-adapter-types.js";

export function createRun(
  request: NativeSubmission,
  context: OperationContext,
  runId: string,
  retryOfRunId?: string,
): LocalNativeRun {
  return {
    request,
    namespace: namespaceOf(context),
    service: context.service,
    runId,
    acceptedAt: new Date().toISOString(),
    status: "queued",
    attempt: 1,
    canonicalInput: request.canonicalInput ?? { version: 1, kind: "json", value: request.input },
    ...(retryOfRunId === undefined ? {} : { retryOfRunId }),
    completedSleeps: new Set(),
  };
}

export function newRunId(service: string): string {
  return `${service}-${randomUUID()}`;
}

export function handle(run: LocalNativeRun): RunHandle {
  return {
    accepted: true,
    runId: run.runId,
    jobId: run.request.jobId,
    taskId: run.request.taskId,
    taskVersion: run.request.taskVersion,
    acceptedAt: run.acceptedAt,
  };
}

export function snapshot(run: LocalNativeRun | undefined): RunSnapshot {
  if (run === undefined) throw new Error("Native run was not found");
  return snapshotOf(run);
}

export function listRuns(
  state: LocalNativeState,
  query: NativeRunQuery,
  context: OperationContext,
): RunPage<RunSnapshot> {
  const limit = query.limit ?? 25;
  const items = [...state.runs.values()]
    .filter((run) => sameNamespace(run, context) && matches(run, query))
    .sort(
      (left, right) =>
        left.acceptedAt.localeCompare(right.acceptedAt) || left.runId.localeCompare(right.runId),
    )
    .slice(0, limit)
    .map(snapshotOf);
  return {
    items,
    hasMore: false,
    availability: [{ service: "local", state: "available" }],
    count: { value: items.length, accuracy: "exact" },
  };
}

function matches(run: LocalNativeRun, query: RunListQuery): boolean {
  return (
    (query.runId === undefined || query.runId === run.runId) &&
    (query.jobId === undefined || query.jobId === run.request.jobId) &&
    (query.taskId === undefined || query.taskId === run.request.taskId) &&
    (query.taskVersion === undefined || query.taskVersion === run.request.taskVersion) &&
    (query.buildId === undefined || query.buildId === run.request.buildId) &&
    (query.service === undefined || query.service === run.service) &&
    (query.status === undefined || query.status.includes(run.status))
  );
}
