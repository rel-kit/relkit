import type {
  JobsAdapterRuntime,
  NativeControlReceipt,
  NativeReceipt,
  NativeRun,
  NativeRunPage,
  NativeRunQuery,
  NativeScheduleOperations,
  NativeSubmission,
  NativeWatchRequest,
  OperationContext,
} from "@relkit/jobs/adapter";
import type { EffectMqWorkerHandle, EffectMqWorkerRegistrationOptions } from "./worker.js";
import { createEffectMqPostgresSchedules } from "./postgres-schedules.js";
import { createEffectMqPostgresState, type EffectMqPostgresState } from "./postgres-state.js";
import {
  cancelEffectMqRun,
  getEffectMqRun,
  listEffectMqRuns,
  retryEffectMqRun,
  submitEffectMq,
} from "./postgres-operations.js";

export interface EffectMqNativeClient {
  readonly submit: (request: NativeSubmission, context: OperationContext) => Promise<NativeReceipt>;
  readonly get: (runId: string, context: OperationContext) => Promise<NativeRun>;
  readonly list: (query: NativeRunQuery, context: OperationContext) => Promise<NativeRunPage>;
  readonly cancel: (
    runId: string,
    operationId: string,
    context: OperationContext,
  ) => Promise<NativeControlReceipt>;
  readonly retry: (
    request: Parameters<NonNullable<JobsAdapterRuntime["retry"]>>[0],
    context: OperationContext,
  ) => Promise<NativeControlReceipt>;
  readonly observe?: JobsAdapterRuntime["observe"];
  readonly schedules?: NativeScheduleOperations;
  readonly close?: () => Promise<void>;
  readonly registerWorker?: (options: EffectMqWorkerRegistrationOptions) => EffectMqWorkerHandle;
}

export interface EffectMqPostgresNativeOptions {
  readonly postgresUrl: string;
  readonly tablePrefix?: string;
  readonly queue?: string;
}

export function createEffectMqPostgresNativeClient(
  options: EffectMqPostgresNativeOptions,
): EffectMqNativeClient {
  let state: EffectMqPostgresState | undefined;
  const getState = (worker?: EffectMqWorkerRegistrationOptions): EffectMqPostgresState => {
    if (state !== undefined) {
      if (worker !== undefined && worker.startWorker !== false && !state.workerStarted) {
        throw new Error("RELKIT_EFFECT_MQ_WORKER_MUST_BE_REGISTERED_BEFORE_USE");
      }
      return state;
    }
    state = createEffectMqPostgresState({
      postgresUrl: options.postgresUrl,
      ...(options.tablePrefix === undefined ? {} : { tablePrefix: options.tablePrefix }),
      ...(options.queue === undefined ? {} : { queue: options.queue }),
      ...(worker === undefined
        ? {}
        : {
            definitions: worker.definitions,
            executor: worker.executor,
            startWorker: worker.startWorker !== false,
          }),
    });
    return state;
  };
  const schedules = createEffectMqPostgresSchedules(() => getState(), options.queue);
  let worker: EffectMqWorkerHandle | undefined;
  const client: EffectMqNativeClient = {
    submit: (request, context) => submitEffectMq(getState(), request, context),
    get: (runId, context) => getEffectMqRun(getState(), runId, context),
    list: (query, context) => listEffectMqRuns(getState(), query, context),
    cancel: (runId, operationId, context) =>
      cancelEffectMqRun(getState(), runId, operationId, context),
    retry: (request, context) => retryEffectMqRun(getState(), request, context),
    schedules,
    registerWorker: (workerOptions) => {
      if (worker !== undefined) return worker;
      const current = getState(workerOptions);
      const handle: EffectMqWorkerHandle = {
        definitions: Object.freeze([...workerOptions.definitions]),
        ready: current.ready,
        close: current.close,
      };
      let readyPromise: Promise<void> | undefined;
      worker = Object.freeze({
        ...handle,
        ready: () => (readyPromise ??= current.ready()),
      });
      return worker;
    },
    close: async () => {
      await worker?.close();
      await state?.close();
    },
  };
  return Object.freeze(client);
}
