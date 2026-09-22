import type { JobUnknownOutcome } from "@relkit/contracts/jobs";
import type { RunRetryReceipt, RunSnapshot } from "@relkit/contracts/jobs";
import type {
  NativeControlReceipt,
  NativeRetryRequest,
  OperationContext,
} from "@relkit/jobs/adapter";
import {
  isAmbiguousInngestWrite,
  rememberInngestRecord,
  type InngestRunApi,
  type InngestRunMetadata,
} from "./runs.js";
import { readInngestRun } from "./run-operations.js";

const terminal = new Set<RunSnapshot["status"]>(["completed", "failed", "cancelled", "timed-out"]);

export async function cancelInngestRun(
  locator: string,
  operationId: string,
  reason: string | undefined,
  context: OperationContext,
  api: InngestRunApi,
  records: Map<string, InngestRunMetadata>,
): Promise<NativeControlReceipt> {
  const run = await readInngestRun(locator, context, api, records);
  if (terminal.has(run.status))
    return { runId: run.runId, operationId, outcome: "already-terminal", run };
  if (run.runId.startsWith("event:"))
    return { runId: run.runId, operationId, outcome: "unsupported" };
  try {
    await api.cancel(run.runId, reason, context.signal);
  } catch (error) {
    if (isAmbiguousInngestWrite(error)) return unknownControl(operationId);
    throw error;
  }
  return {
    runId: run.runId,
    operationId,
    outcome: "requested",
    requestedAt: new Date().toISOString(),
  };
}

export async function retryInngestRun(
  request: NativeRetryRequest,
  context: OperationContext,
  api: InngestRunApi,
  records: Map<string, InngestRunMetadata>,
  retryResults: Map<string, NativeControlReceipt>,
): Promise<NativeControlReceipt> {
  const retryIdentity = `${request.runId}\0${request.retryIdentity ?? request.operationId}`;
  const previous = retryResults.get(retryIdentity);
  if (previous !== undefined) return previous;
  const run = await readInngestRun(request.runId, context, api, records);
  if (terminal.has(run.status) === false) throw new Error("Inngest retry requires a terminal run.");
  if (run.runId.startsWith("event:"))
    return { runId: run.runId, operationId: request.operationId, outcome: "unsupported" };
  let response: Record<string, unknown>;
  try {
    response = await api.retry(run.runId, context.signal);
  } catch (error) {
    if (isAmbiguousInngestWrite(error))
      return rememberRetry(retryResults, retryIdentity, unknownControl(request.operationId));
    throw error;
  }
  const data = record(response.data);
  const newRunIdValue = data?.run_id ?? data?.runId ?? response.run_id ?? response.runId;
  if (typeof newRunIdValue !== "string" || newRunIdValue === "" || newRunIdValue === run.runId) {
    return rememberRetry(retryResults, retryIdentity, unknownControl(request.operationId));
  }
  const source = records.get(run.runId) ?? records.get(request.runId.replace(/^event:/u, ""));
  const acceptedAt = new Date().toISOString();
  const inputHash = request.inputHash ?? source?.inputHash ?? run.inputHash;
  const inputSchemaHash = request.inputSchemaHash ?? source?.inputSchemaHash ?? run.inputSchemaHash;
  const scope = request.scope ?? source?.scope ?? run.scope;
  const acceptanceIdentity =
    request.acceptanceIdentity ?? source?.acceptanceIdentity ?? run.acceptanceIdentity;
  const metadata: InngestRunMetadata = {
    accepted: true,
    runId: newRunIdValue,
    jobId: request.jobId ?? source?.jobId ?? run.jobId,
    taskId: request.taskId ?? source?.taskId ?? run.taskId,
    taskVersion: request.taskVersion ?? source?.taskVersion ?? run.taskVersion,
    acceptedAt,
    eventId: source?.eventId ?? run.runId,
    buildId: request.buildId ?? source?.buildId ?? run.buildId,
    service: source?.service ?? context.service,
    ...(source?.input === undefined ? {} : { input: source.input }),
    ...(inputHash === undefined ? {} : { inputHash }),
    ...(inputSchemaHash === undefined ? {} : { inputSchemaHash }),
    ...(scope === undefined ? {} : { scope }),
    ...(acceptanceIdentity === undefined ? {} : { acceptanceIdentity }),
    ...(source?.occurrenceIdentity === undefined
      ? {}
      : { occurrenceIdentity: source.occurrenceIdentity }),
    ...(source?.parentRunId === undefined ? {} : { parentRunId: source.parentRunId }),
    ...(source?.scheduledFor === undefined ? {} : { scheduledFor: source.scheduledFor }),
    ...(source?.tags === undefined ? {} : { tags: source.tags }),
    ...(source?.correlationId === undefined ? {} : { correlationId: source.correlationId }),
    ...(source?.propagation === undefined ? {} : { propagation: source.propagation }),
    serviceGeneration: source?.serviceGeneration ?? context.serviceGeneration,
    retryOfRunId: run.runId,
  };
  rememberInngestRecord(records, newRunIdValue, metadata);
  const receipt: RunRetryReceipt = {
    accepted: true,
    runId: newRunIdValue,
    jobId: metadata.jobId,
    taskId: metadata.taskId,
    taskVersion: metadata.taskVersion,
    acceptedAt,
    retryOfRunId: run.runId,
  };
  return rememberRetry(retryResults, retryIdentity, receipt);
}

function rememberRetry(
  retries: Map<string, NativeControlReceipt>,
  identity: string,
  value: NativeControlReceipt,
): NativeControlReceipt {
  retries.set(identity, value);
  while (retries.size > 1_000) {
    const oldest = retries.keys().next().value;
    if (typeof oldest !== "string") break;
    retries.delete(oldest);
  }
  return value;
}

function unknownControl(operationId: string): JobUnknownOutcome {
  return Object.freeze({
    code: "RELKIT_JOB_CONTROL_UNKNOWN" as const,
    outcome: "unknown" as const,
    operationId,
    recovery: { action: "inspect-native" as const },
  });
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
