import type {
  JobsAdapterRuntime,
  NativeControlReceipt,
  NativeRetryRequest,
  NativeScheduleOperations,
  NativeWatchRequest,
  OperationContext,
} from "@relkit/jobs/adapter";
import {
  assertSupportedJobsServiceOptions,
  deserializeJobsServiceOptions,
  durationToMillis,
  type JobsServiceOptions,
} from "@relkit/jobs";
import type { RuntimeProviderContext, RuntimeProviderIntegration } from "@relkit/provider";
import { createTriggerHttpClient, type TriggerNativeClient } from "./native.js";
import { observeTriggerRun, type TriggerObservationOptions } from "./subscription.js";
import { createTriggerWorker, type TriggerTaskDefinition, type TriggerWorkerHandle, type TriggerSdk } from "./task-binding.js";

export * from "./native.js";
export * from "./subscription.js";
export * from "./task-binding.js";

export interface TriggerRuntimeOptions {
  readonly projectRef: string;
  readonly secretKey?: string;
  readonly baseUrl: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly native?: TriggerNativeClient;
  readonly sdk?: TriggerSdk;
  readonly supportsDurableSleep?: boolean;
  readonly pollIntervalMs?: number;
  readonly maxPolls?: number;
  readonly serviceOptions?: JobsServiceOptions;
}

export interface TriggerWorkerRegistrationOptions {
  readonly definitions: readonly TriggerTaskDefinition[];
  readonly executor: import("@relkit/jobs/adapter").TaskExecutor;
  readonly startWorker?: boolean;
  readonly register?: (tasks: readonly unknown[]) => Promise<void> | void;
}

export interface TriggerRuntime extends JobsAdapterRuntime {
  readonly registerWorker: (options: TriggerWorkerRegistrationOptions) => TriggerWorkerHandle;
}

export function createTriggerRuntime(options: TriggerRuntimeOptions): TriggerRuntime {
  assertSupportedJobsServiceOptions(options.serviceOptions ?? {}, ["observation"]);
  text(options.projectRef, "Trigger projectRef");
  url(options.baseUrl);
  const native = options.native ?? createTriggerHttpClient({
    baseUrl: options.baseUrl,
    projectRef: options.projectRef,
    ...(options.secretKey === undefined ? {} : { secretKey: options.secretKey }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  const observationSupport = native.subscribeToRun === undefined ? "adapter" as const : "native" as const;
  const workers = new Set<TriggerWorkerHandle>();
  const cancelResults = new Map<string, NativeControlReceipt>();
  const retryResults = new Map<string, NativeControlReceipt>();
  const adapter = {
    kind: "jobs-adapter-runtime",
    protocolVersion: 1 as const,
    capabilities: Object.freeze({
      service: "trigger",
      provider: "trigger",
      adapterId: "trigger",
      protocolVersion: 1 as const,
      features: Object.freeze({ submission: true, read: true, list: true, observation: true, cancel: true, retry: true, "durable-sleep": options.supportsDurableSleep === true, schedules: native.schedules !== undefined }),
      capabilities: Object.freeze({
        submission: { support: "native" as const, evidence: ["Trigger task trigger API"] },
        read: { support: "native" as const, evidence: ["Trigger runs.get"] },
        list: { support: "native" as const, evidence: ["Trigger runs.list scoped by project"] },
        observation: { support: observationSupport, evidence: [native.subscribeToRun === undefined ? "bounded native polling" : "runs.subscribeToRun with cleanup"] },
        cancel: { support: "native" as const, evidence: ["Trigger runs.cancel"] },
        retry: { support: "native" as const, evidence: ["Trigger runs.retry"] },
        "durable-sleep": options.supportsDurableSleep === true
          ? { support: "native" as const, evidence: ["Trigger task wait API"] }
          : { support: "unverified" as const, evidence: ["Trigger Docker checkpoint/sleep is not certified"] },
        ...(native.schedules === undefined ? {} : { schedules: { support: "native" as const, evidence: ["certified Trigger schedule client"] } }),
      }),
    }),
    submit: native.submit,
    get: native.get,
    list: native.list,
    observe: (request: NativeWatchRequest, context: OperationContext) =>
      observeTriggerRun(request, context, native, observationOptions(options)),
    cancel: async (request, context) => {
      const key = request.runId + ":" + request.operationId;
      const previous = cancelResults.get(key);
      if (previous !== undefined) return previous;
      const result = await native.cancel(request.runId, request.operationId, request.reason, context);
      if (!unknown(result)) cancelResults.set(key, result);
      return result;
    },
    retry: async (request: NativeRetryRequest, context: OperationContext) => {
      const key = request.runId + ":" + (request.retryIdentity ?? request.operationId);
      const previous = retryResults.get(key);
      if (previous !== undefined) return previous;
      const result = await native.retry(request, context);
      if (!unknown(result)) retryResults.set(key, result);
      return result;
    },
    ...(native.schedules === undefined ? {} : { schedules: native.schedules }),
    registerWorker: (workerOptions: TriggerWorkerRegistrationOptions) => {
      const register = workerOptions.register ?? native.registerTasks;
      const worker = options.sdk === undefined
        ? createTriggerWorker({ ...workerOptions, ...(register === undefined ? {} : { register }) })
        : createTriggerWorker({ sdk: options.sdk, ...workerOptions, ...(register === undefined ? {} : { register }) });
      workers.add(worker);
      return worker;
    },
    close: async () => {
      await Promise.allSettled([...workers].map((worker) => worker.close()));
      workers.clear();
      await native.close?.();
    },
  } satisfies TriggerRuntime;
  return Object.freeze(adapter);
}

export const runtimeIntegration: RuntimeProviderIntegration<"trigger"> = Object.freeze({
  kind: "runtime-integration",
  integrationId: "trigger",
  registrations: Object.freeze([{
    capability: "job",
    adapterId: "trigger",
    protocolVersion: 1,
    create: ({ connection, behavior }: RuntimeProviderContext) => {
      const serviceOptions = deserializeJobsServiceOptions(behavior);
      assertSupportedJobsServiceOptions(serviceOptions, ["observation"]);
      const projectRef = text(connection.projectRef, "Trigger projectRef");
      const secretKey = optionalText(connection.secretKey);
      const baseUrl = optionalText(connection.baseUrl) ?? "http://127.0.0.1:8030";
      const runtime = createTriggerRuntime({ projectRef, baseUrl, ...(secretKey === undefined ? {} : { secretKey }), serviceOptions });
      return { value: runtime, release: runtime.close };
    },
  }]),
}) satisfies RuntimeProviderIntegration<"trigger">;

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(label + " is invalid");
  return value;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function url(value: string): void {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new TypeError("Trigger baseUrl is invalid");
}

function unknown(value: NativeControlReceipt): boolean {
  return "outcome" in value && value.outcome === "unknown";
}

function observationOptions(options: TriggerRuntimeOptions): TriggerObservationOptions {
  const serviceObservation = options.serviceOptions?.observation;
  return Object.freeze({
    ...(options.pollIntervalMs === undefined && serviceObservation?.pollInterval === undefined
      ? {}
      : { pollIntervalMs: options.pollIntervalMs ?? durationToMillis(serviceObservation!.pollInterval!) }),
    ...(serviceObservation?.readTimeout === undefined
      ? {}
      : { readTimeoutMs: durationToMillis(serviceObservation.readTimeout) }),
    ...(options.maxPolls === undefined ? {} : { maxPolls: options.maxPolls }),
  });
}
