import type {
  JobsAdapterRuntime,
  NativeScheduleOperations,
} from "@relkit/jobs/adapter";
import {
  assertSupportedJobsServiceOptions,
  deserializeJobsServiceOptions,
  durationToMillis,
  type JobsServiceOptions,
} from "@relkit/jobs";
import type { RuntimeProviderContext, RuntimeProviderIntegration } from "@relkit/provider";
import { createEffectMqWorker, type EffectMqWorkerHandle, type EffectMqWorkerRegistrationOptions } from "./worker.js";
import { optionalText } from "./support.js";
import { createEffectMqPostgresNativeClient, type EffectMqNativeClient } from "./native.js";
import { observeEffectMqRun } from "./observe.js";

export * from "./native.js";
export * from "./schedules.js";
export * from "./worker.js";
export * from "../job.js";
export * from "../postgres.js";

export interface EffectMqRuntimeOptions {
  readonly native?: EffectMqNativeClient;
  readonly postgresUrl?: string;
  readonly tablePrefix?: string;
  readonly queue?: string;
  readonly schedules?: NativeScheduleOperations;
  readonly pollIntervalMs?: number;
  readonly maxPolls?: number;
  readonly readTimeoutMs?: number;
  readonly serviceOptions?: JobsServiceOptions;
}

export interface EffectMqRuntime extends JobsAdapterRuntime {
  readonly registerWorker: (options: EffectMqWorkerRegistrationOptions) => EffectMqWorkerHandle;
}

export function createEffectMqRuntime(options: EffectMqRuntimeOptions = {}): EffectMqRuntime {
  assertSupportedJobsServiceOptions(options.serviceOptions ?? {}, ["observation"]);
  const native = options.native ?? (options.postgresUrl === undefined ? unboundNative() : createEffectMqPostgresNativeClient({
    postgresUrl: options.postgresUrl,
    ...(options.tablePrefix === undefined ? {} : { tablePrefix: options.tablePrefix }),
    ...(options.queue === undefined ? {} : { queue: options.queue }),
  }));
  const serviceObservation = options.serviceOptions?.observation;
  const effectiveOptions = {
    ...options,
    ...(options.pollIntervalMs === undefined && serviceObservation?.pollInterval === undefined
      ? {}
      : { pollIntervalMs: options.pollIntervalMs ?? durationToMillis(serviceObservation!.pollInterval!) }),
    ...(options.readTimeoutMs === undefined && serviceObservation?.readTimeout === undefined
      ? {}
      : { readTimeoutMs: options.readTimeoutMs ?? durationToMillis(serviceObservation!.readTimeout!) }),
  };
  const schedules = options.schedules ?? native.schedules;
  const workers = new Set<EffectMqWorkerHandle>();
  const adapter = {
    kind: "jobs-adapter-runtime",
    protocolVersion: 1 as const,
    capabilities: Object.freeze({
      service: "effect-mq",
      provider: "effect-mq",
      adapterId: "effect-mq",
      protocolVersion: 1 as const,
      features: Object.freeze({
        submission: true,
        read: true,
        list: true,
        observation: true,
        cancel: true,
        retry: true,
        schedules: schedules !== undefined,
        "durable-sleep": false,
      }),
      capabilities: Object.freeze({
        submission: { support: "native" as const, evidence: ["effect-mq Job.make enqueue"] },
        read: { support: "native" as const, evidence: ["effect-mq Job.poll"] },
        list: { support: "native" as const, evidence: ["PostgreSQL JobStore query"] },
        observation: { support: "adapter" as const, evidence: ["native poll or bounded provider watch"] },
        cancel: { support: "native" as const, evidence: ["effect-mq JobStore.cancel"] },
        retry: { support: "native" as const, evidence: ["effect-mq Job.retry"] },
        ...(schedules === undefined ? {} : { schedules: { support: "native" as const, evidence: ["effect-mq Job.schedule"] } }),
        "durable-sleep": { support: "unsupported" as const, evidence: ["retryable PostgreSQL profile"] },
      }),
    }),
    submit: native.submit,
    get: native.get,
    list: native.list,
    observe: native.observe ?? ((request, context) => observeEffectMqRun(native.get, request, context, effectiveOptions)),
    cancel: (request, context) => native.cancel(request.runId, request.operationId, context),
    retry: native.retry,
    ...(schedules === undefined ? {} : { schedules }),
    registerWorker: (workerOptions: EffectMqWorkerRegistrationOptions) => {
      const worker = native.registerWorker?.(workerOptions) ?? createEffectMqWorker(workerOptions);
      workers.add(worker);
      return worker;
    },
    close: async () => {
      await Promise.allSettled([...workers].map((worker) => worker.close()));
      workers.clear();
      await native.close?.();
    },
  } satisfies EffectMqRuntime;
  return Object.freeze(adapter);
}

export const runtimeIntegration: RuntimeProviderIntegration<"effect-mq"> = Object.freeze({
  kind: "runtime-integration",
  integrationId: "effect-mq",
  registrations: Object.freeze([{
    capability: "job",
    adapterId: "effect-mq",
    protocolVersion: 1,
    create: ({ connection, behavior }: RuntimeProviderContext) => {
      const databaseUrl = optionalText(connection.postgresUrl);
      if (databaseUrl === undefined) throw new Error("effect-mq postgresUrl is required for a runtime binding");
      const serviceOptions = deserializeJobsServiceOptions(behavior);
      assertSupportedJobsServiceOptions(serviceOptions, ["observation"]);
      const tablePrefix = optionalText(connection.tablePrefix);
      const queue = optionalText(connection.queue);
      const runtime = createEffectMqRuntime({
        serviceOptions,
        postgresUrl: databaseUrl,
        ...(tablePrefix === undefined ? {} : { tablePrefix }),
        ...(queue === undefined ? {} : { queue }),
      });
      return { value: runtime, release: runtime.close };
    },
  }]),
}) satisfies RuntimeProviderIntegration<"effect-mq">;

function unboundNative(): EffectMqNativeClient {
  const fail = async (): Promise<never> => { throw new Error("RELKIT_EFFECT_MQ_RUNTIME_UNBOUND"); };
  return { submit: fail, get: fail, list: fail, cancel: fail, retry: fail };
}
