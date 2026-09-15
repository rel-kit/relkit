import type {
  NativeControlReceipt,
  NativeReceipt,
  NativeRetryRequest,
  NativeRun,
  NativeRunPage,
  NativeRunQuery,
  NativeScheduleOperations,
  NativeSubmission,
  OperationContext,
} from "@relkit/jobs/adapter";
import { createTriggerSdkNativeClient } from "./sdk-native.js";

export interface TriggerSubscription {
  readonly stream: AsyncIterable<unknown>;
  readonly unsubscribe?: () => Promise<void> | void;
}

export interface TriggerSdkApi {
  readonly tasks: {
    readonly trigger: (...args: readonly unknown[]) => Promise<unknown>;
  };
  readonly runs: {
    readonly retrieve: (...args: readonly unknown[]) => Promise<unknown>;
    readonly list: (...args: readonly unknown[]) => Promise<unknown>;
    readonly cancel: (...args: readonly unknown[]) => Promise<unknown>;
    readonly replay: (...args: readonly unknown[]) => Promise<unknown>;
    readonly subscribeToRun: (...args: readonly unknown[]) => AsyncIterable<unknown>;
  };
}

export interface TriggerNativeClient {
  readonly submit: (request: NativeSubmission, context: OperationContext) => Promise<NativeReceipt>;
  readonly get: (runId: string, context: OperationContext) => Promise<NativeRun>;
  readonly list: (query: NativeRunQuery, context: OperationContext) => Promise<NativeRunPage>;
  readonly cancel: (runId: string, operationId: string, reason: string | undefined, context: OperationContext) => Promise<NativeControlReceipt>;
  readonly retry: (request: NativeRetryRequest, context: OperationContext) => Promise<NativeControlReceipt>;
  readonly subscribeToRun?: (runId: string, context: OperationContext, after?: string) => Promise<TriggerSubscription | undefined>;
  readonly schedules?: NativeScheduleOperations;
  readonly registerTasks?: (tasks: readonly unknown[]) => Promise<void> | void;
  readonly close?: () => Promise<void>;
}

export interface TriggerHttpClientOptions {
  readonly baseUrl: string;
  readonly projectRef: string;
  readonly secretKey?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly client?: TriggerSdkApi;
}

/** Compatibility name retained for callers; the implementation uses the pinned SDK. */
export function createTriggerHttpClient(options: TriggerHttpClientOptions): TriggerNativeClient {
  return createTriggerSdkNativeClient(options);
}

export { statusOf, triggerSnapshot } from "./sdk-mapping.js";
export { triggerTaskIdentifier } from "./sdk-support.js";
