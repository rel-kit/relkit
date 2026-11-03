/**
 * Exposes the framework-owned descriptor identity and application context wiring
 * needed by emitted hosts, including selected dependency preflight. Re-exports
 * preserve identity while resolving framework dependencies from their owning app.
 */
export { bindDescriptorIdentity } from "../invocation/index.js";
export { createApplicationContextResolver } from "./context-resolver.js";
export {
  checkIntegrationDependencies,
  SelectedDependenciesLive,
  initializeIntegration,
} from "../provider/dependency-preflight.service.js";
