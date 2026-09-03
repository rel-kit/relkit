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
const app = createApp({
  plan,
  manifest: executableManifest,
  engine: { invoke: invokeHttp },
  observability: telemetry,
  responseMapping: { mode: environment },
  middlewareContext: routeMiddlewareContext,
  middleware: { generationId, observability: telemetry, maxBodyBytes: ${configuration.maxBodyBytes},
    ...(environment === "production" || process.env.RELKIT_DEV_LOGS !== "1" ? {} : { onLifecycleEvent(event) {
      if (event.type === "request.started") return;
      const internal = event.path.startsWith("/_relkit/");
      const level = event.status >= 500 ? "error" : event.status >= 400 ? "warn" : internal || event.type === "request.cancelled" ? "debug" : "info";
      writeRuntimeLog(telemetry.collect({ version: 1, signal: "log", timestamp: event.completedAt,
        level, component: "runtime.http", message: event.type,
        requestId: event.requestId, traceId: event.traceId, generationId, graphHash,
        fields: { method: event.method, path: event.path, status: event.status, durationMs: event.durationMs } }));
    } }),
  },
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
      ready: providerReady && databaseReady && authReady && !stopping,
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
    actions: {
      functions: {
        exists: (functionId) => registry.has(functionId),
        invoke: (request) => invokeHttp({ functionId: request.functionId, input: request.input, source: "direct", ...(request.signal === undefined ? {} : { signal: request.signal }) }),
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
  fetch: async (request) => {
    const path = new URL(request.url).pathname;
    if (path === "/_relkit/v1/health/live") return healthResponse("ok");
    if (path === "/_relkit/v1/health/ready")
      return healthResponse(providerReady && databaseReady && authReady && !stopping ? "ready" : "not-ready", providerReady && databaseReady && authReady && !stopping ? 200 : 503);
    if (stopping) return Response.json({ error: "draining" }, { status: 503 });
    if (!providerReady || !databaseReady || !authReady)
      return Response.json({ error: "not-ready" }, { status: 503 });
    try {
      return await app.fetch(request);
    } catch {
      return Response.json({ error: "internal-error" }, { status: 500 });
    }
  },
});`;
}
