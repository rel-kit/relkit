/**
 * Emits the prepared generation's deferred inspector registration callback.
 * Core health/graph endpoints stay on the eager shell. Rich inspector queries
 * import their implementation once through the scoped transport load owner.
 */
import { inspectorEndpointsSource } from "./build-server-http-inspector.js";
import type { ServerSourceConfiguration } from "./build-server.types.js";

/**
 * Reuses canonical inspector options with a lazy framework import.
 * @param configuration - Accepted document/preview and endpoint configuration.
 * @returns Native initializer source; it contains no acquisition before invocation.
 */
export function preparedInspectorSource(configuration: ServerSourceConfiguration): string {
  // This replacement selects a callable in our fixed emitter, never application text.
  const registration = inspectorEndpointsSource(configuration).replace(
    "installInspectorEndpoints(app,",
    "module.installInspectorEndpoints(app,",
  );
  return `async (app) => {
  const module = await import("@relkit/inspector-api");
  InspectorQueryError = module.InspectorQueryError;
  ${registration}
}`;
}
