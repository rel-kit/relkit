import { createRequire } from "node:module";
import type {
  NativeControlReceipt,
  NativeRetryRequest,
  NativeRunQuery,
  NativeSubmission,
  OperationContext,
} from "@relkit/jobs/adapter";
import type { JobUnknownOutcome, RunHandle } from "@relkit/contracts/jobs";
import type { TriggerHttpClientOptions, TriggerNativeClient, TriggerSdkApi } from "./native.js";
import { record } from "./sdk-mapping.js";

export function metadata(
  request: NativeSubmission,
  context: OperationContext,
): Record<string, string> {
  const acceptanceIdentity = request.acceptanceIdentity ?? context.acceptanceIdentity;
  const occurrenceIdentity = request.occurrenceIdentity ?? context.occurrenceIdentity;
  const inputSchemaHash = request.inputSchemaHash ?? context.inputSchemaHash;
  const parentRunId = request.parentRunId ?? context.parentRunId;
  const retryOfRunId = request.retryOfRunId ?? context.retryOfRunId;
  const correlationId = request.correlationId ?? context.correlationId;
  const propagation = request.propagation ?? context.propagation;
  return {
    relkitApplication: context.application,
    relkitEnvironment: context.environment,
    relkitJobId: request.jobId,
    relkitTaskId: request.taskId,
    relkitTaskVersion: request.taskVersion,
    relkitBuildId: request.buildId,
    relkitService: context.service,
    relkitServiceGeneration: context.serviceGeneration,
    relkitScope: request.scope ?? context.scope,
    ...(request.inputHash === undefined ? {} : { relkitInputHash: request.inputHash }),
    ...(inputSchemaHash === undefined ? {} : { relkitInputSchemaHash: inputSchemaHash }),
    ...(acceptanceIdentity === undefined ? {} : { relkitAcceptanceIdentity: acceptanceIdentity }),
    ...(occurrenceIdentity === undefined ? {} : { relkitOccurrenceIdentity: occurrenceIdentity }),
    ...(parentRunId === undefined ? {} : { relkitParentRunId: parentRunId }),
    ...(request.scheduledFor === undefined ? {} : { relkitScheduledFor: request.scheduledFor }),
    ...(retryOfRunId === undefined ? {} : { relkitRetryOfRunId: retryOfRunId }),
    ...(correlationId === undefined ? {} : { relkitCorrelationId: correlationId }),
    ...(propagation === undefined ? {} : { relkitPropagation: JSON.stringify(propagation) }),
  };
}

export function triggerOptions(
  request: NativeSubmission,
  context: OperationContext,
): Record<string, unknown> {
  return {
    idempotencyKey:
      request.acceptanceIdentity ??
      context.acceptanceIdentity ??
      request.idempotencyKey ??
      request.operationId,
    metadata: metadata(request, context),
    ...(request.tags === undefined ? {} : { tags: [...request.tags] }),
  };
}

export function handle(value: unknown, request: NativeSubmission): RunHandle {
  const runId = text(record(value)?.id, "Trigger run id");
  return {
    accepted: true,
    runId,
    jobId: request.jobId,
    taskId: request.taskId,
    taskVersion: request.taskVersion,
    acceptedAt: new Date().toISOString(),
  };
}

export function loadClient(options: TriggerHttpClientOptions): TriggerSdkApi {
  const require = createRequire(import.meta.url);
  try {
    const module = require("@trigger.dev/sdk/v3") as {
      readonly TriggerClient?: new (config: Record<string, unknown>) => TriggerSdkApi;
    };
    if (module.TriggerClient === undefined) throw new Error("missing TriggerClient");
    return new module.TriggerClient({
      baseURL: options.baseUrl,
      ...(options.secretKey === undefined ? {} : { accessToken: options.secretKey }),
    });
  } catch {
    throw new Error("RELKIT_TRIGGER_SDK_UNAVAILABLE");
  }
}

export function unknownSubmission(request: NativeSubmission): JobUnknownOutcome {
  return {
    code: "RELKIT_JOB_SUBMISSION_UNKNOWN",
    outcome: "unknown",
    operationId: request.operationId,
    recovery: { action: "retry-with-same-key" },
  };
}

export function unknownControl(operationId: string): JobUnknownOutcome {
  return {
    code: "RELKIT_JOB_CONTROL_UNKNOWN",
    outcome: "unknown",
    operationId,
    recovery: { action: "inspect-native" },
  };
}

export function definiteRejection(error: unknown): boolean {
  const status = record(error)?.status;
  if (typeof status === "number") return status >= 400 && status < 500;
  return error instanceof Error && /\b4\d\d\b/u.test(error.message);
}

export function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value === "") throw new TypeError(label + " is invalid");
  return value;
}
