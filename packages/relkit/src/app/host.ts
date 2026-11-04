/**
 * Exposes the framework-owned descriptor identity and application context wiring
 * needed by emitted hosts, including selected dependency preflight. Re-exports
 * preserve identity while resolving framework dependencies from their owning app.
 */
export { bindDescriptorIdentity } from "../invocation/index.js";
// The context resolver and its constant runner were exported only by the `relkit` root before it
// became a curated list.
export * from "./context-resolver.js";
export { AppConstantRunner, AppConstantRunnerLive } from "./context-resolution-service.js";
export {
  checkRuntimeIntegrations,
  loadRuntimeIntegration,
} from "../provider/dependency-runtime.js";
// Development reload: the warm evaluator and the dev server evict changed modules with this.
export { createModuleReloader } from "./dev-module-reload.js";
export type { ModuleReloader } from "./dev-module-reload.js";
