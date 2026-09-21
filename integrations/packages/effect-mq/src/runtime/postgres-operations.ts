import type {
  NativeControlReceipt,
  NativeRun,
  NativeRunPage,
  NativeRunQuery,
  NativeRetryRequest,
  NativeSubmission,
  OperationContext,
} from "@relkit/jobs/adapter";
import { Effect, Option } from "effect";
import { JobStore } from "effect-mq";
import type { EffectMqPostgresState } from "./postgres-state.js";
import { effectMqSnapshot } from "./postgres-snapshots.js";
import { matches, metadataFilter, states, terminal, terminalState } from "./postgres-query.js";
import { object, submissionId, submissionMetadata, text } from "./postgres-operations-support.js";

export async function submitEffectMq(
  state: EffectMqPostgresState,
  request: NativeSubmission,
  context: OperationContext,
): Promise<NativeReceiptValue> {
  const job = state.ensureJob(request.jobId);
  const runId = submissionId(request);
  const before = await readRecord(state, runId, context.signal);
  const metadata = submissionMetadata(request, context);
  const payload = {
    input: request.canonicalInput ?? { version: 1, kind: "json", value: request.input },
    metadata,
  };
  const enqueue: Record<string, unknown> = { jobId: runId, metadata };
  if (request.scheduledFor !== undefined) enqueue.at = request.scheduledFor;
  await state.run(job.enqueue({ input: payload } as never, enqueue as never), context.signal);
  const after = await readRecord(state, runId, context.signal);
  return {
    accepted: true,
    runId,
    jobId: request.jobId,
    taskId: request.taskId,
    taskVersion: request.taskVersion,
    acceptedAt: new Date(after?.enqueuedAt ?? before?.enqueuedAt ?? Date.now()).toISOString(),
    ...(before === undefined ? {} : { duplicate: true }),
  };
}

export async function getEffectMqRun(
  state: EffectMqPostgresState,
  runId: string,
  context: OperationContext,
): Promise<NativeRun> {
  const record = await readRecord(state, runId, context.signal);
  if (record === undefined) throw new Error(`Effect MQ run "${runId}" was not found`);
  return effectMqSnapshot(state, record, context);
}

export async function listEffectMqRuns(
  state: EffectMqPostgresState,
  query: NativeRunQuery,
  context: OperationContext,
): Promise<NativeRunPage> {
  const result = await state.run(
    Effect.flatMap(JobStore.JobStore, (store) =>
      store.list({
        ...metadataFilter(query),
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        limit: Math.min(query.limit ?? 50, 500),
        ...(states(query.status) === undefined ? {} : { states: states(query.status) }),
      }),
    ),
    context.signal,
  );
  const items = (
    await Promise.all(result.items.map((record) => effectMqSnapshot(state, record, context)))
  ).filter((run) => matches(query, run));
  return {
    items,
    ...(result.cursor === undefined ? {} : { nextCursor: result.cursor }),
    hasMore: result.cursor !== undefined,
    availability: [],
    count: { value: items.length, accuracy: "approximate" },
  };
}

export async function cancelEffectMqRun(
  state: EffectMqPostgresState,
  runId: string,
  operationId: string,
  context: OperationContext,
): Promise<NativeControlReceipt> {
  const run = await getEffectMqRun(state, runId, context);
  if (terminal(run.status)) return { runId, operationId, outcome: "already-terminal", run };
  await state.run(
    Effect.flatMap(JobStore.JobStore, (store) => store.cancel(JobStore.JobId(runId))),
    context.signal,
  );
  return { runId, operationId, outcome: "requested", requestedAt: new Date().toISOString() };
}

export async function retryEffectMqRun(
  state: EffectMqPostgresState,
  request: NativeRetryRequest,
  context: OperationContext,
): Promise<NativeControlReceipt> {
  const original = await readRecord(state, request.runId, context.signal);
  if (original === undefined) throw new Error(`Effect MQ run "${request.runId}" was not found`);
  if (!terminalState(original.state)) throw new Error("Effect MQ retry requires a terminal run");
  const runId = `relkit/retry/${request.runId}/${request.retryIdentity ?? request.operationId}`;
  const before = await readRecord(state, runId, context.signal);
  const existingPayload = object(original.payload) ?? {};
  const existingInput = object(existingPayload.input) ?? {};
  const input = request.canonicalInput ?? existingInput.input;
  const payload = {
    ...existingPayload,
    input: { ...existingInput, ...(input === undefined ? {} : { input }) },
  };
  const metadata = {
    ...original.metadata,
    relkitRetryOfRunId: request.runId,
    ...(request.operationId === undefined ? {} : { relkitOperationId: request.operationId }),
  };
  const job = state.ensureJob(original.name);
  await state.run(
    job.enqueue(
      { input: payload.input } as never,
      {
        jobId: runId,
        queue: String(original.queue),
        metadata,
      } as never,
    ),
    context.signal,
  );
  return {
    accepted: true,
    runId,
    jobId: request.jobId ?? text(original.metadata.relkitJobId, original.name),
    taskId: request.taskId ?? text(original.metadata.relkitTaskId, original.name),
    taskVersion: request.taskVersion ?? text(original.metadata.relkitTaskVersion, "unknown"),
    acceptedAt: new Date(before?.enqueuedAt ?? Date.now()).toISOString(),
    retryOfRunId: request.runId,
    ...(before === undefined ? {} : { duplicate: true }),
  };
}

export async function readRecord(
  state: EffectMqPostgresState,
  runId: string,
  signal: AbortSignal,
): Promise<JobStore.JobRecord | undefined> {
  return state
    .run(
      Effect.flatMap(JobStore.JobStore, (store) => store.getJob(JobStore.JobId(runId))),
      signal,
    )
    .then((value) => (Option.isNone(value) ? undefined : value.value));
}

export type NativeReceiptValue = NativeSubmissionReceipt;
type NativeSubmissionReceipt = {
  readonly accepted: true;
  readonly runId: string;
  readonly jobId: string;
  readonly taskId: string;
  readonly taskVersion: string;
  readonly acceptedAt: string;
  readonly duplicate?: boolean;
};
