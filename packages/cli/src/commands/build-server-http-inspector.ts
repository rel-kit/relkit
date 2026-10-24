import {
  NATIVE_JOBS_INSPECTOR_SOURCE,
  RESOURCE_INSPECTOR_SOURCE,
} from "./build-server-inspector-runtime.js";
import type { ServerSourceConfiguration } from "./build-server-http.js";

/**
 * Emits inspector callbacks against the generated host's existing runtime adapters.
 * @param configuration - Validated inspector preview configuration.
 * @returns Pure source retaining query, native jobs, and resource inspection contracts.
 */
export function inspectorEndpointsSource(configuration: ServerSourceConfiguration): string {
  return `installInspectorEndpoints(app, {
  mode: environment,
  enabled: internalEndpointsEnabled,
  authorize: (request) => process.env.RELKIT_INSPECTOR_SESSION_TOKEN !== undefined && request.headers.get("x-relkit-inspector-session-token") === process.env.RELKIT_INSPECTOR_SESSION_TOKEN,
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
    runtime: {
      events: { query: queryEventRuntime },
      buckets: () => resourceRuntimeMetadata("bucket", plan.buckets),
      cache: () => resourceRuntimeMetadata("cache", plan.caches),
    },
${NATIVE_JOBS_INSPECTOR_SOURCE}    actions: {
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
${RESOURCE_INSPECTOR_SOURCE}
  },
  maxPreviewBytes: ${configuration.maxPreviewBytes},
  query: telemetry.query,
  stream: telemetry.stream,
});`;
}
