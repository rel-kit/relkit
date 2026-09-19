import { GENERATOR_VERSION, GRAPH_VERSION, MANIFEST_VERSION } from "@relkit/contracts";

export interface ServerSourceConfiguration {
  readonly maxBodyBytes: number;
  readonly apiDocs: {
    readonly enabledInProduction: boolean;
    readonly excludeDomains?: readonly string[];
  };
  readonly clientContract: boolean;
  readonly mcp: boolean;
  readonly maxPreviewBytes: number;
}

export function serverHttpSource(configuration: ServerSourceConfiguration): string {
  return `const internalEndpointsEnabled = environment !== "production" || process.env.RELKIT_INTERNAL_ENDPOINTS === "1";
const httpMiddlewareOptions = {
  generationId, graphHash, observability: telemetry, spanRuntime, maxBodyBytes: ${configuration.maxBodyBytes},
  ...(environment === "production" || process.env.RELKIT_DEV_LOGS !== "1" ? {} : { onLifecycleEvent(event) {
    if (event.type === "request.started") return;
    const level = event.status >= 500 ? "error" : event.status >= 400 ? "warn" : event.type === "request.cancelled" ? "debug" : "info";
    writeRuntimeLog(telemetry.collect({ version: 2, signal: "log", timestamp: event.completedAt,
      level, component: "runtime.http", message: event.type,
      requestId: event.requestId, originRequestId: event.requestId, traceId: event.traceId, generationId, graphHash,
      fields: { method: event.method, path: event.path, status: event.status, durationMs: event.durationMs } }));
  } }),
};
const app = createApp({
  upgradeWebSocket,
  plan,
  manifest: executableManifest,
  engine: { invoke: invokeHttp },
  observability: telemetry,
  responseMapping: { mode: environment },
  middlewareContext: routeMiddlewareContext,
  middleware: httpMiddlewareOptions,
  apiDocs: {
    mode: environment,
    document: openapiDocument,
    enabledInProduction: ${String(configuration.apiDocs.enabledInProduction)},
    excludeDomains: ${JSON.stringify(configuration.apiDocs.excludeDomains ?? [])},
    ...(process.env.RELKIT_INTERNAL_ENDPOINT_TOKEN === undefined
      ? {}
      : { bearerToken: process.env.RELKIT_INTERNAL_ENDPOINT_TOKEN }),
  },
  clientContract: {
    enabled: ${String(configuration.clientContract)},
    document: clientContractDocument,
  },
  clientIdentity: {
    applicationId: graph.appId,
    publicFingerprint,
    ...((plan.jobs ?? []).length === 0 ? {} : { jobs: { protocol: "relkit.jobs", version: 1 } }),
    resolve: ({ request, session }) => resolveClientIdentityRegistration(request, session),
  },
  transportSecurity: transportSecurityRegistration(),
  ...((plan.channels ?? []).length === 0 ? {} : {
    realtime: {
      applicationId: graph.appId,
      environment,
      provider: async (profile) => {
        const registry = await providerStartup;
        if (registry === undefined) throw new Error("Realtime provider registry unavailable.");
        return provider(registry, "realtime", profile);
      },
      trustedContext: ({ request, auth }) => ({ request, auth }),
    },
  }),
  ...(plan.agents.every((node) => node.client === undefined) ? {} : {
    agentRuntime: {
      applicationId: graph.appId,
      environment,
      generationId,
      publicFingerprint,
      signal: shutdownController.signal,
      track: (task) => {
        activeInvocations.add(task);
        const done = () => activeInvocations.delete(task);
        void task.then(done, done);
      },
      provider: async (profile) => {
        const registry = await providerStartup;
        if (registry === undefined) throw new Error("Agent-state provider registry unavailable.");
        return provider(registry, "agent-state", profile);
      },
      trustedContext: ({ request, auth }) => ({ request, auth }),
    },
  }),
  ...((plan.jobs ?? []).length === 0 ? {} : {
    jobs: {
      runtimes: () => nativeJobsRuntimes,
      descriptors: runtimeManifest.jobs,
      tasks: runtimeManifest.tasks,
      application: graph.appId,
      environment,
      publicFingerprint,
      protocolVersion: 1,
      ...(process.env.RELKIT_JOBS_CURSOR_SECRET === undefined
        ? {}
        : { cursorSecret: process.env.RELKIT_JOBS_CURSOR_SECRET }),
    },
  }),
  mcp: { enabled: ${String(configuration.mcp)} },
  staticFiles: { root: process.env.RELKIT_PUBLIC_ROOT ?? new URL("../public", import.meta.url).pathname },
  rateLimitRuntime: { resolveStore: resolveRateLimitStore },
  ...(authRuntime === undefined ? {} : { auth: authRuntime }),
  internalEndpoints: {
    mode: environment,
    enabled: internalEndpointsEnabled,
    graph: {
      generationId,
      graphHash,
      activationFingerprint,
      manifestGraphHash: runtimeManifest.graphHash,
      graphContractVersion: ${GRAPH_VERSION},
      manifestContractVersion: ${MANIFEST_VERSION},
      manifestGeneratorVersion: ${GENERATOR_VERSION},
      graph,
    },
    ...(process.env.RELKIT_INTERNAL_ENDPOINT_TOKEN === undefined
      ? {}
      : { bearerToken: process.env.RELKIT_INTERNAL_ENDPOINT_TOKEN }),
    readiness: () => ({
      ready: providerReady && nativeJobWorkerReady && databaseReady && authReady && !stopping,
      ...(stopping ? { reason: "stopping" } : providerFailed || specializedFailed ? { reason: "unavailable" } : {}),
    }),
  },
});
installInspectorEndpoints(app, {
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
});
const server = Bun.serve({
  hostname: "0.0.0.0",
  port: Number(process.env.PORT ?? 3000),
  websocket: honoWebSocket,
  fetch: (request, bunServer) => instrumentHttpRequest(request, httpMiddlewareOptions, async (request) => {
    const path = new URL(request.url).pathname;
    if (path === "/_relkit/v1/health/live") return healthResponse("ok");
    if (path === "/_relkit/v1/health/ready")
      return healthResponse(providerReady && nativeJobWorkerReady && databaseReady && authReady && !stopping ? "ready" : "not-ready", providerReady && nativeJobWorkerReady && databaseReady && authReady && !stopping ? 200 : 503);
    if (stopping) return Response.json({ error: "draining" }, { status: 503 });
    const nativeWorker = nativeJobHandler(request);
    if (nativeWorker !== undefined) return await nativeWorker;
    if (!providerReady || !nativeJobWorkerReady || !databaseReady || !authReady)
      return Response.json({ error: "not-ready" }, { status: 503 });
    try {
      return await app.fetch(request, bunServer);
    } catch {
      return Response.json({ error: "internal-error" }, { status: 500 });
    }
  }),
});
nativeJobWorkerServerReady = true;
void readyNativeJobWorkers();`;
}
