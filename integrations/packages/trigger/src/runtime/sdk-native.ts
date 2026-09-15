import { createRequire } from "node:module";
import type {
  NativeControlReceipt,
  NativeRetryRequest,
  NativeRunQuery,
  NativeSubmission,
  OperationContext,
} from "@relkit/jobs/adapter";
import type { JobUnknownOutcome, RunHandle } from "@relkit/contracts/jobs";
import { type TriggerHttpClientOptions, type TriggerNativeClient, type TriggerSdkApi, type TriggerSubscription } from "./native.js";
import { record, triggerSnapshot } from "./sdk-mapping.js";
import { listRuns } from "./sdk-list.js";
import { triggerTaskIdentifier } from "./sdk-support.js";

export function createTriggerSdkNativeClient(options: TriggerHttpClientOptions): TriggerNativeClient {
  const client = options.client ?? loadClient(options);
  return Object.freeze({
    submit: async (request: NativeSubmission, context: OperationContext) => {
      try {
        const response = await client.tasks.trigger(
          triggerTaskIdentifier(request),
          { input: request.canonicalInput ?? { version: 1, kind: "json", value: request.input }, relkit: metadata(request, context) },
          triggerOptions(request, context),
          { signal: context.signal },
        );
        return handle(response, request);
      } catch (error) {
        if (definiteRejection(error)) throw error;
        return unknownSubmission(request);
      }
    },
    get: async (runId: string, context: OperationContext) => triggerSnapshot(
      await client.runs.retrieve(runId, { signal: context.signal }), context, runId,
    ),
    list: (query: NativeRunQuery, context: OperationContext) => listRuns(client, options.projectRef, query, context),
    cancel: async (runId: string, operationId: string, _reason: string | undefined, context: OperationContext): Promise<NativeControlReceipt> => {
      try {
        await client.runs.cancel(runId, { signal: context.signal });
      } catch (error) {
        if (definiteRejection(error)) throw error;
        return unknownControl(operationId);
      }
      return { runId, operationId, outcome: "requested", requestedAt: new Date().toISOString() };
    },
    retry: async (request: NativeRetryRequest, context: OperationContext): Promise<NativeControlReceipt> => {
      try {
        const response = await client.runs.replay(request.runId, { signal: context.signal });
        const runId = text(record(response)?.id, "Trigger replay run id");
        return {
          accepted: true,
          runId,
          jobId: request.jobId ?? "unknown",
          taskId: request.taskId ?? "unknown",
          taskVersion: request.taskVersion ?? "unknown",
          acceptedAt: new Date().toISOString(),
          retryOfRunId: request.runId,
        };
      } catch (error) {
        if (definiteRejection(error)) throw error;
        return unknownControl(request.operationId);
      }
    },
    subscribeToRun: async (runId: string, context: OperationContext, after?: string): Promise<TriggerSubscription | undefined> => {
      if (after !== undefined) throw new Error("RELKIT_TRIGGER_SUBSCRIPTION_CURSOR_UNSUPPORTED");
      const stream = client.runs.subscribeToRun(runId, { signal: context.signal });
      const iterator = stream as unknown as AsyncIterator<unknown>;
      return { stream, unsubscribe: async () => { await iterator.return?.(); } };
    },
  });
}

function metadata(request: NativeSubmission, context: OperationContext): Record<string, string> {
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

function triggerOptions(request: NativeSubmission, context: OperationContext): Record<string, unknown> {
  return {
    idempotencyKey: request.acceptanceIdentity ?? context.acceptanceIdentity ?? request.idempotencyKey ?? request.operationId,
    metadata: metadata(request, context),
    ...(request.tags === undefined ? {} : { tags: [...request.tags] }),
  };
}

function handle(value: unknown, request: NativeSubmission): RunHandle {
  const runId = text(record(value)?.id, "Trigger run id");
  return { accepted: true, runId, jobId: request.jobId, taskId: request.taskId, taskVersion: request.taskVersion, acceptedAt: new Date().toISOString() };
}

function loadClient(options: TriggerHttpClientOptions): TriggerSdkApi {
  const require = createRequire(import.meta.url);
  try {
    const module = require("@trigger.dev/sdk/v3") as { readonly TriggerClient?: new (config: Record<string, unknown>) => TriggerSdkApi };
    if (module.TriggerClient === undefined) throw new Error("missing TriggerClient");
    return new module.TriggerClient({ baseURL: options.baseUrl, ...(options.secretKey === undefined ? {} : { accessToken: options.secretKey }) });
  } catch {
    throw new Error("RELKIT_TRIGGER_SDK_UNAVAILABLE");
  }
}

function unknownSubmission(request: NativeSubmission): JobUnknownOutcome {
  return { code: "RELKIT_JOB_SUBMISSION_UNKNOWN", outcome: "unknown", operationId: request.operationId, recovery: { action: "retry-with-same-key" } };
}

function unknownControl(operationId: string): JobUnknownOutcome {
  return { code: "RELKIT_JOB_CONTROL_UNKNOWN", outcome: "unknown", operationId, recovery: { action: "inspect-native" } };
}

function definiteRejection(error: unknown): boolean {
  const status = record(error)?.status;
  if (typeof status === "number") return status >= 400 && status < 500;
  return error instanceof Error && /\b4\d\d\b/u.test(error.message);
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value === "") throw new TypeError(label + " is invalid");
  return value;
}
