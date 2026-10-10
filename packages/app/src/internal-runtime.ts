/**
 * Exposes the framework-owned descriptor identity and application context wiring
 * needed by emitted hosts. Both exports preserve their authoring facade identity;
 * this entrypoint avoids evaluating unrelated agent and transport declarations.
 */
export { bindDescriptorIdentity } from "@relkit/invocation";
export { createApplicationContextResolver } from "./context-resolver.js";
