import { GENERATOR_VERSION, GRAPH_VERSION, MANIFEST_VERSION } from "@relkit/contracts";
import type { ServerSourceConfiguration } from "./build-server-http.js";

export function inspectorEndpointsSource(configuration: ServerSourceConfiguration): string {
  return `installInspectorEndpoints(app, {
  mode: environment,
  enabled: internalEndpointsEnabled,
  ...(process.env.RELKIT_INTERNAL_ENDPOINT_TOKEN === undefined
    ? {}
    : { bearerToken: process.env.RELKIT_INTERNAL_ENDPOINT_TOKEN }),
  activeGeneration: {
    generationId,
    graphHash,
    activationFingerprint,
    graph,
    diagnostics: [],
    integrations: runtimeIntegrationsPlan,
    localServices: localServicesInspector,
    telemetry: () => ({
      sampling: telemetryConfiguration?.exportSampling ?? {},
      counters: telemetry.exportCounters(),
      exporters: telemetry.exporterStats(),
    }),
    ...((plan.jobs ?? []).length === 0 ? {} : {
      jobs: {
      bindings: () => [...nativeJobsRuntimes.values()].map((runtime) => ({
        service: runtime.service,
        serviceGeneration: runtime.serviceGeneration,
        ...(runtime.capabilities.provider === undefined ? {} : { provider: runtime.capabilities.provider }),
        capabilities: {
          features: runtime.capabilities.features,
          ...(runtime.capabilities.limits === undefined ? {} : { limits: runtime.capabilities.limits }),
        },
        health: async () => ({ state: "available", serviceGeneration: runtime.serviceGeneration }),
        list: (query, context) => runInJobsRuntime(runtime, () => createJobsControls(runtime).list(query, { signal: context.signal })),
        get: (runId, context) => runInJobsRuntime(runtime, () => createJobsControls(runtime).get(runId, { signal: context.signal })),
        observe: (runId, after, context) => runInJobsRuntime(runtime, () => createJobsControls(runtime).observe({ runId, ...(after === undefined ? {} : { after }) }, { signal: context.signal })),
        cancel: (runId, operationId, reason, context) => runInJobsRuntime(runtime, () => createJobsControls(runtime).cancel(runId, { operationId, ...(reason === undefined ? {} : { reason }), signal: context.signal })),
        retry: (runId, operationId, context) => runInJobsRuntime(runtime, () => createJobsControls(runtime).retry(runId, { operationId, signal: context.signal })),
        ...(runtime.adapter.schedules === undefined ? {} : {
          schedules: {
            list: (query, context) => {
              const schedules = createJobsControls(runtime).schedules;
              if (schedules === undefined) throw new Error("Native schedules are unavailable");
              return schedules.list({ ...query, signal: context.signal });
            },
            get: (id, context) => {
              const schedules = createJobsControls(runtime).schedules;
              if (schedules === undefined) throw new Error("Native schedules are unavailable");
              return schedules.get(id, { signal: context.signal });
            },
            upsert: (definition, context) => {
              const schedules = createJobsControls(runtime).schedules;
              if (schedules === undefined) throw new Error("Native schedules are unavailable");
              return schedules.upsert(definition, { operationId: context.operationId ?? crypto.randomUUID(), signal: context.signal });
            },
            pause: (id, context) => {
              const schedules = createJobsControls(runtime).schedules;
              if (schedules === undefined) throw new Error("Native schedules are unavailable");
              return schedules.pause(id, { operationId: context.operationId ?? crypto.randomUUID(), signal: context.signal });
            },
            resume: (id, context) => {
              const schedules = createJobsControls(runtime).schedules;
              if (schedules === undefined) throw new Error("Native schedules are unavailable");
              return schedules.resume(id, { operationId: context.operationId ?? crypto.randomUUID(), signal: context.signal });
            },
            delete: (id, context) => {
              const schedules = createJobsControls(runtime).schedules;
              if (schedules === undefined) throw new Error("Native schedules are unavailable");
              return schedules.delete(id, { operationId: context.operationId ?? crypto.randomUUID(), signal: context.signal });
            },
          },
        }),
      })),
      ...(process.env.RELKIT_JOBS_CURSOR_SECRET === undefined
        ? {}
        : { cursorSecret: process.env.RELKIT_JOBS_CURSOR_SECRET }),
      },
    }),
    actions: {
      functions: {
        exists: (functionId) => registry.has(functionId),
        invoke: (request) => invokeHttp({ functionId: request.functionId, input: request.input, source: "direct", ...(request.signal === undefined ? {} : { signal: request.signal }) }),
      },
      jobs: {
        protocol: "relkit.jobs.admin",
        version: 1,
        status: (instanceId) => nativeJobStatus(instanceId),
        retry: (request) => nativeJobControl(request.instanceId, "retry", request.reason),
        cancel: (request) => nativeJobControl(request.instanceId, "cancel", request.reason),
      },
    },
    resources: {
      buckets: {
        supports: (bucketId) => supportsInspector("bucket", plan.buckets, bucketId, "list", "preview"),
        list: async ({ bucketId, ...request }) => (await resourceInspector("bucket", plan.buckets, bucketId)).list(request),
        preview: async ({ bucketId, ...request }) => (await resourceInspector("bucket", plan.buckets, bucketId)).preview(request),
      },
      cache: {
        supports: (cacheId) => supportsInspector("cache", plan.caches, cacheId, "scan", "value"),
        scan: async ({ cacheId, ...request }) => (await resourceInspector("cache", plan.caches, cacheId)).scan(request),
        value: async ({ cacheId, ...request }) => (await resourceInspector("cache", plan.caches, cacheId)).value(request),
      },
    },
  },
  maxPreviewBytes: ${configuration.maxPreviewBytes},
  query: telemetry.query,
  stream: telemetry.stream,
});`;
}
