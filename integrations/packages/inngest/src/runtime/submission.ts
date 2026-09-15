import { createHash } from "node:crypto";
import type { NativeSubmission, NativeReceipt, OperationContext } from "@relkit/jobs/adapter";
import type { JobUnknownOutcome } from "@relkit/contracts/jobs";
import type { Inngest } from "inngest";
import { eventIdFrom, eventNameFor } from "./support.js";
import { rememberInngestRecord, type InngestRunMetadata } from "./runs.js";

export async function submitInngestEvent(
  client: Inngest.Any,
  request: NativeSubmission,
  context: OperationContext,
  records: Map<string, InngestRunMetadata>,
  submitted: Map<string, InngestRunMetadata>,
): Promise<NativeReceipt> {
  const eventId = providerEventId(request, context);
  const previous = submitted.get(eventId);
  if (previous !== undefined) return Object.freeze({ ...previous, duplicate: true });
  const eventName = eventNameFor(request);
  const acceptanceIdentity = request.acceptanceIdentity ?? context.acceptanceIdentity;
  const occurrenceIdentity = request.occurrenceIdentity ?? context.occurrenceIdentity;
  const correlationId = request.correlationId ?? context.correlationId;
  const parentRunId = request.parentRunId ?? context.parentRunId;
  const propagation = request.propagation ?? context.propagation;
  const scope = request.scope ?? context.scope;
  const inputSchemaHash = request.inputSchemaHash ?? context.inputSchemaHash;
  const retryOfRunId = request.retryOfRunId ?? context.retryOfRunId;
  let response: unknown;
  try {
    response = await client.send({
      id: eventId,
      name: eventName,
      data: {
        input: request.canonicalInput ?? { version: 1, kind: "json", value: request.input },
        relkit: {
          runId: `event:${eventId}`,
          jobId: request.jobId,
          taskId: request.taskId,
          taskVersion: request.taskVersion,
          buildId: request.buildId,
          service: context.service,
          serviceGeneration: context.serviceGeneration,
          operationId: request.operationId,
          ...(request.inputHash === undefined ? {} : { inputHash: request.inputHash }),
          ...(inputSchemaHash === undefined ? {} : { inputSchemaHash }),
          ...(acceptanceIdentity === undefined ? {} : { acceptanceIdentity }),
          ...(occurrenceIdentity === undefined ? {} : { occurrenceIdentity }),
          ...(parentRunId === undefined ? {} : { parentRunId }),
          ...(scope === undefined ? {} : { scope }),
          ...(request.scheduledFor === undefined ? {} : { scheduledFor: request.scheduledFor }),
          ...(request.tags === undefined ? {} : { tags: request.tags }),
          ...(correlationId === undefined ? {} : { correlationId }),
          ...(propagation === undefined ? {} : { propagation }),
          ...(retryOfRunId === undefined ? {} : { retryOfRunId }),
          ...(request.policy === undefined ? {} : { policy: request.policy }),
        },
      },
    } as never);
  } catch (cause) {
    if (definiteRejection(cause)) throw cause;
    return unknownSubmission(request);
  }
  const nativeEventId = eventIdFrom(response, eventId);
  const metadata: InngestRunMetadata = {
    accepted: true,
    runId: `event:${nativeEventId}`,
    jobId: request.jobId,
    taskId: request.taskId,
    taskVersion: request.taskVersion,
    acceptedAt: new Date().toISOString(),
    eventId: nativeEventId,
    input: request.input,
    ...(request.inputHash === undefined ? {} : { inputHash: request.inputHash }),
    ...(inputSchemaHash === undefined ? {} : { inputSchemaHash }),
    buildId: request.buildId,
    service: context.service,
    ...(scope === undefined ? {} : { scope }),
    ...(acceptanceIdentity === undefined ? {} : { acceptanceIdentity }),
    ...(occurrenceIdentity === undefined ? {} : { occurrenceIdentity }),
    ...(parentRunId === undefined ? {} : { parentRunId }),
    ...(request.scheduledFor === undefined ? {} : { scheduledFor: request.scheduledFor }),
    ...(retryOfRunId === undefined ? {} : { retryOfRunId }),
    ...(request.tags === undefined ? {} : { tags: request.tags }),
    ...(correlationId === undefined ? {} : { correlationId }),
    ...(propagation === undefined ? {} : { propagation }),
    serviceGeneration: context.serviceGeneration,
  };
  rememberInngestRecord(records, eventId, metadata);
  rememberInngestRecord(records, nativeEventId, metadata);
  rememberInngestRecord(submitted, eventId, metadata);
  return Object.freeze(metadata);
}

export function providerEventId(request: NativeSubmission, context: OperationContext): string {
  const occurrenceIdentity = request.occurrenceIdentity ?? context.occurrenceIdentity;
  const identity = request.acceptanceIdentity ?? context.acceptanceIdentity ?? JSON.stringify([
    context.application,
    context.environment,
    context.scope,
    request.jobId,
    request.taskId,
    request.taskVersion,
    request.buildId,
    request.idempotencyKey ?? request.operationId,
  ]);
  const eventIdentity = occurrenceIdentity === undefined ? identity : JSON.stringify([identity, occurrenceIdentity]);
  return `relkit-${createHash("sha256").update(eventIdentity).digest("hex")}`;
}

function unknownSubmission(request: NativeSubmission): JobUnknownOutcome {
  return Object.freeze({
    code: "RELKIT_JOB_SUBMISSION_UNKNOWN" as const,
    outcome: "unknown" as const,
    operationId: request.operationId,
    ...(request.idempotencyKey === undefined ? {} : { idempotencyKey: request.idempotencyKey }),
    recovery: { action: "retry-with-same-key" as const },
  });
}

function definiteRejection(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause);
  const match = message.match(/(?:Inngest API Error|native API request failed)[^\d]*(\d{3})/iu);
  if (match === null) return false;
  const status = Number(match[1]);
  return status >= 400 && status < 500;
}
