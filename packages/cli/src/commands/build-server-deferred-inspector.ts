/**
 * Emits the prepared generation's deferred inspector registration callback.
 * Core health/graph endpoints stay on the eager shell. Rich inspector queries
 * import their implementation once through the scoped transport load owner.
 */
import { inspectorEndpointsSource } from "./build-server-http-inspector.js";
import type { ServerSourceConfiguration } from "./build-server.types.js";

/**
 * Emits the inspection authority of the eager graph probe: the development bridge's session
 * reads the whole graph projection at `/_relkit/v1/graph`, every other caller its identity only.
 * @param configuration - Accepted inspector configuration; production builds emit nothing.
 * @returns An `internalEndpoints` spread fragment that imports the projection only when asked.
 */
export function inspectionGraphSource(configuration: ServerSourceConfiguration): string {
  if (!configuration.inspectorEnabled) return "";
  return `
    ...(environment !== "production" && process.env.RELKIT_INSPECTOR_SESSION_TOKEN !== undefined
      ? {
          inspection: {
            authorize: (request) => request.headers.get("x-relkit-inspector-session-token") === process.env.RELKIT_INSPECTOR_SESSION_TOKEN,
            graph: async () => (await import("relkit/inspector-api")).graphSnapshot({ generationId, graphHash, activationFingerprint, graph, observedEdges: [...observedEdges.values()], integrations: runtimeIntegrationsPlan }),
          },
        }
      : {}),`;
}

/**
 * Reuses canonical inspector options with a lazy framework import.
 * @param configuration - Accepted document/preview and endpoint configuration.
 * @returns Native initializer source; it contains no acquisition before invocation.
 */
export function preparedInspectorSource(configuration: ServerSourceConfiguration): string {
  if (!configuration.inspectorEnabled) return "undefined";
  // This replacement selects a callable in our fixed emitter, never application text.
  const registration = inspectorEndpointsSource(configuration).replace(
    "installInspectorEndpoints(app,",
    "module.installInspectorEndpoints(app,",
  );
  return `environment !== "production" && process.env.RELKIT_INSPECTOR_SESSION_TOKEN !== undefined ? async (app) => {
  const module = await import("relkit/inspector-api");
  InspectorQueryError = module.InspectorQueryError;
  try {
    ${registration}
    return () => module.disposeInspectorEndpoints(app);
  } catch (cause) {
    await module.disposeInspectorEndpoints(app);
    throw cause;
  }
} : undefined`;
}
