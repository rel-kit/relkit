import {
  assertSupportedJobsServiceOptions,
  deserializeJobsServiceOptions,
  durationToMillis,
  type JobsServiceOptions,
} from "@relkit/jobs";
import type { JobsAdapterRuntime, NativeControlReceipt, NativeReceipt } from "@relkit/jobs/adapter";
import { createInngestRunApi, type InngestRunMetadata } from "./runs.js";
import { observeInngestRun } from "./observe.js";
import { listInngestRuns, readInngestRun } from "./run-operations.js";
import { cancelInngestRun, retryInngestRun } from "./run-controls.js";
import { mapInngestPolicy } from "./policy.js";
import { subscribeInngestRun } from "./realtime.js";
import {
  createInngestWorker,
  type InngestWorkerHandle,
  type InngestWorkerRegistrationOptions,
  loadInngestSdk,
} from "./task-binding.js";
import { optionalText, text, url } from "./support.js";
import type { RuntimeProviderContext, RuntimeProviderIntegration } from "@relkit/provider";
import { providerEventId, submitInngestEvent } from "./submission.js";

export interface InngestRuntime extends JobsAdapterRuntime {
  readonly registerWorker: (
    options: InngestWorkerRegistrationOptions,
  ) => InngestWorkerHandle;
}

export interface InngestRuntimeOptions {
  readonly appId: string;
  readonly baseUrl: string;
  readonly eventKey?: string;
  readonly signingKey?: string;
  readonly serveOrigin?: string;
  readonly appVersion?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly pollIntervalMs?: number;
  readonly maxPolls?: number;
  readonly serviceOptions?: JobsServiceOptions;
}

export function createInngestRuntime(options: InngestRuntimeOptions): InngestRuntime {
  assertSupportedJobsServiceOptions(options.serviceOptions ?? {}, ["observation"]);
  text(options.appId, "Inngest appId");
  url(options.baseUrl);
  const { Inngest } = loadInngestSdk();
  const client = new Inngest({
    id: options.appId,
    ...(options.eventKey === undefined ? {} : { eventKey: options.eventKey }),
    ...(options.signingKey === undefined ? {} : { signingKey: options.signingKey }),
    baseUrl: options.baseUrl,
    isDev: false,
    ...(options.appVersion === undefined ? {} : { appVersion: options.appVersion }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  const api = createInngestRunApi(options);
  const records = new Map<string, InngestRunMetadata>();
  const submitted = new Map<string, InngestRunMetadata>();
  const retryResults = new Map<string, NativeControlReceipt>();
  const pendingSubmissions = new Map<string, Promise<NativeReceipt>>();
  const workers = new Set<InngestWorkerHandle>();
  const adapter = {
    kind: "jobs-adapter-runtime",
    protocolVersion: 1,
    capabilities: Object.freeze({
      service: "inngest",
      provider: "inngest",
      adapterId: "inngest",
      protocolVersion: 1,
      features: Object.freeze({ submission: true, read: true, list: true, observation: true, cancel: true, retry: true, "durable-sleep": true }),
      capabilities: Object.freeze({
        submission: { support: "native" as const, evidence: ["inngest event API"] },
        list: { support: "adapter" as const, constraints: { scope: "accepted event receipts" }, evidence: ["event-scoped Inngest run API; bounded local index"] },
        observation: { support: "adapter" as const, evidence: ["Inngest realtime SDK cleanup plus bounded run reads"] },
        retry: { support: "native" as const, evidence: ["Inngest native run control API"] },
        "durable-sleep": { support: "native" as const, evidence: ["ctx.step.sleep keyed by task sleep identity"] },
      }),
    }),
    submit: async (request, context) => {
      mapInngestPolicy(request.policy);
      if (request.scheduledFor !== undefined) {
        throw new Error("Inngest scheduled submissions require a certified native schedule.");
      }
      if (options.eventKey === undefined) throw new Error("Inngest eventKey is required for submission.");
      const eventId = providerEventId(request, context);
      const pending = pendingSubmissions.get(eventId);
      if (pending !== undefined) return duplicateReceipt(await pending);
      const operation = submitInngestEvent(client, request, context, records, submitted);
      pendingSubmissions.set(eventId, operation);
      try {
        return await operation;
      } finally {
        if (pendingSubmissions.get(eventId) === operation) pendingSubmissions.delete(eventId);
      }
    },
    get: async (locator, context) => readInngestRun(locator, context, api, records),
    list: async (query, context) => listInngestRuns(query, context, api, records),
    observe: (request, context) => observeInngestRun(request, context, {
      get: (runId, operation) => readInngestRun(runId, operation, api, records),
      ...observationOptions(options),
      subscribe: (runId, onSnapshot, operation) => subscribeInngestRun(
        client,
        options.appId,
        runId,
        async () => onSnapshot(await readInngestRun(runId, operation, api, records)),
        operation,
      ),
    }),
    cancel: async (request, context) => cancelInngestRun(request.runId, request.operationId, request.reason, context, api, records),
    retry: async (request, context) => retryInngestRun(request, context, api, records, retryResults),
    registerWorker: (workerOptions: InngestWorkerRegistrationOptions): InngestWorkerHandle => {
      const worker = createInngestWorker({
        client,
        ...workerOptions,
        ...(workerOptions.serveOrigin === undefined && options.serveOrigin === undefined
          ? {}
          : { serveOrigin: workerOptions.serveOrigin ?? options.serveOrigin }),
      });
      workers.add(worker);
      return worker;
    },
    close: async () => {
      await Promise.allSettled([...workers].map((worker) => worker.close()));
      workers.clear();
    },
  } satisfies InngestRuntime;
  return Object.freeze(adapter);
}

export const runtimeIntegration: RuntimeProviderIntegration<"inngest"> = Object.freeze({
  kind: "runtime-integration",
  integrationId: "inngest",
  registrations: Object.freeze([
    {
      capability: "job",
      adapterId: "inngest",
      protocolVersion: 1,
    create: ({ connection, executionModel, behavior }: RuntimeProviderContext) => {
        if (executionModel !== "task") throw new Error("Inngest requires the task execution model.");
        const serviceOptions = deserializeJobsServiceOptions(behavior);
        assertSupportedJobsServiceOptions(serviceOptions, ["observation"]);
        const eventKey = optionalText(connection.eventKey);
        const signingKey = optionalText(connection.signingKey);
        const appVersion = optionalText(connection.appVersion);
        const serveOrigin = optionalText(process.env.RELKIT_INNGEST_SERVE_ORIGIN) ?? optionalText(connection.serveOrigin);
        const runtime = createInngestRuntime({
          appId: optionalText(connection.appId) ?? "relkit",
          baseUrl: optionalText(process.env.RELKIT_INNGEST_BASE_URL) ?? optionalText(connection.baseUrl) ?? "http://127.0.0.1:8288",
          ...(eventKey === undefined ? {} : { eventKey }),
          ...(signingKey === undefined ? {} : { signingKey }),
          ...(appVersion === undefined ? {} : { appVersion }),
          ...(serveOrigin === undefined ? {} : { serveOrigin }),
          serviceOptions,
        });
        return { value: runtime, release: runtime.close };
      },
    },
  ]),
}) satisfies RuntimeProviderIntegration<"inngest">;

function duplicateReceipt(value: NativeReceipt): NativeReceipt {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.hasOwn(value, "accepted") && (value as { readonly accepted?: unknown }).accepted === true
    ? Object.freeze({ ...value, duplicate: true })
    : value;
}

function observationOptions(options: InngestRuntimeOptions): Readonly<Record<string, number>> {
  const serviceObservation = options.serviceOptions?.observation;
  return Object.freeze({
    ...(options.pollIntervalMs === undefined && serviceObservation?.pollInterval === undefined
      ? {}
      : { pollIntervalMs: options.pollIntervalMs ?? durationToMillis(serviceObservation!.pollInterval!) }),
    ...(serviceObservation?.readTimeout === undefined
      ? {}
      : { readTimeoutMs: durationToMillis(serviceObservation.readTimeout) }),
  });
}

export * from "./observe.js";
export * from "./runs.js";
export * from "./task-binding.js";
