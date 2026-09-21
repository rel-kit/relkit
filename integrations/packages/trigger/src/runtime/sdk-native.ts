import type {
  NativeControlReceipt,
  NativeRetryRequest,
  NativeRunQuery,
  NativeSubmission,
  OperationContext,
} from "@relkit/jobs/adapter";
import type { RunHandle } from "@relkit/contracts/jobs";
import {
  type TriggerHttpClientOptions,
  type TriggerNativeClient,
  type TriggerSdkApi,
  type TriggerSubscription,
} from "./native.js";
import { record, triggerSnapshot } from "./sdk-mapping.js";
import { listRuns } from "./sdk-list.js";
import { triggerTaskIdentifier } from "./sdk-support.js";
import {
  definiteRejection,
  handle,
  loadClient,
  metadata,
  text,
  triggerOptions,
  unknownControl,
  unknownSubmission,
} from "./sdk-native-support.js";

export function createTriggerSdkNativeClient(
  options: TriggerHttpClientOptions,
): TriggerNativeClient {
  const client = options.client ?? loadClient(options);
  return Object.freeze({
    submit: async (request: NativeSubmission, context: OperationContext) => {
      try {
        const response = await client.tasks.trigger(
          triggerTaskIdentifier(request),
          {
            input: request.canonicalInput ?? { version: 1, kind: "json", value: request.input },
            relkit: metadata(request, context),
          },
          triggerOptions(request, context),
          { signal: context.signal },
        );
        return handle(response, request);
      } catch (error) {
        if (definiteRejection(error)) throw error;
        return unknownSubmission(request);
      }
    },
    get: async (runId: string, context: OperationContext) =>
      triggerSnapshot(
        await client.runs.retrieve(runId, { signal: context.signal }),
        context,
        runId,
      ),
    list: (query: NativeRunQuery, context: OperationContext) =>
      listRuns(client, options.projectRef, query, context),
    cancel: async (
      runId: string,
      operationId: string,
      _reason: string | undefined,
      context: OperationContext,
    ): Promise<NativeControlReceipt> => {
      try {
        await client.runs.cancel(runId, { signal: context.signal });
      } catch (error) {
        if (definiteRejection(error)) throw error;
        return unknownControl(operationId);
      }
      return { runId, operationId, outcome: "requested", requestedAt: new Date().toISOString() };
    },
    retry: async (
      request: NativeRetryRequest,
      context: OperationContext,
    ): Promise<NativeControlReceipt> => {
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
    subscribeToRun: async (
      runId: string,
      context: OperationContext,
      after?: string,
    ): Promise<TriggerSubscription | undefined> => {
      if (after !== undefined) throw new Error("RELKIT_TRIGGER_SUBSCRIPTION_CURSOR_UNSUPPORTED");
      const stream = client.runs.subscribeToRun(runId, { signal: context.signal });
      const iterator = stream as unknown as AsyncIterator<unknown>;
      return {
        stream,
        unsubscribe: async () => {
          await iterator.return?.();
        },
      };
    },
  });
}
