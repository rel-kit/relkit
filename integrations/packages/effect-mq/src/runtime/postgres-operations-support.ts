import type { NativeSubmission, OperationContext } from "@relkit/jobs/adapter";

export function submissionId(request: NativeSubmission): string {
  return `relkit/${request.acceptanceIdentity ?? request.idempotencyKey ?? request.operationId}`;
}

export function submissionMetadata(
  request: NativeSubmission,
  context: OperationContext,
): Readonly<Record<string, string>> {
  const scope = request.scope ?? context.scope;
  const occurrenceIdentity = request.occurrenceIdentity ?? context.occurrenceIdentity;
  const acceptanceIdentity = request.acceptanceIdentity ?? context.acceptanceIdentity;
  const correlationId = request.correlationId ?? context.correlationId;
  const propagation = request.propagation ?? context.propagation;
  return {
    relkitJobId: request.jobId,
    relkitTaskId: request.taskId,
    relkitTaskVersion: request.taskVersion,
    relkitBuildId: request.buildId,
    relkitService: context.service,
    relkitServiceGeneration: context.serviceGeneration,
    relkitScope: scope,
    relkitAcceptedAt: new Date().toISOString(),
    ...(request.inputHash === undefined ? {} : { relkitInputHash: request.inputHash }),
    ...(request.inputSchemaHash === undefined
      ? {}
      : { relkitInputSchemaHash: request.inputSchemaHash }),
    ...(acceptanceIdentity === undefined ? {} : { relkitAcceptanceIdentity: acceptanceIdentity }),
    ...(occurrenceIdentity === undefined ? {} : { relkitOccurrenceIdentity: occurrenceIdentity }),
    ...(request.scheduledFor === undefined ? {} : { relkitScheduledFor: request.scheduledFor }),
    ...(request.parentRunId === undefined ? {} : { relkitParentRunId: request.parentRunId }),
    ...(request.retryOfRunId === undefined ? {} : { relkitRetryOfRunId: request.retryOfRunId }),
    ...(correlationId === undefined ? {} : { relkitCorrelationId: correlationId }),
    ...(request.tags === undefined ? {} : { relkitTags: JSON.stringify(request.tags) }),
    ...(propagation === undefined ? {} : { relkitPropagation: JSON.stringify(propagation) }),
  };
}

export function object(value: unknown): Record<string, any> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : undefined;
}

export function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value !== "" ? value : fallback;
}
