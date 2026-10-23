/**
 * Exposes internal portable contracts used across RELKIT compiler and runtime
 * packages. Application authoring facades select their public APIs separately;
 * layout evidence and path calculations do not create authoring descriptors.
 */
export * from "./id.js";
export * from "./application-layout.js";
export * from "./descriptor.js";
export * from "./json.js";
export * from "./source-location.js";
export * from "./version.js";
export * from "./runtime-integration.js";
export * from "./integration-dependencies.js";
export * from "./activation.js";
export * from "./client.js";
export * from "./runtime-limits.js";
export * from "./trace-context.js";
export * from "./trace-propagation.js";
export * from "./trace-random.js";
export * from "./contract-observability.js";
export * from "./agent-content.js";
export * from "./agent-events.js";
export * from "./agent-execution.js";
export * from "./agent-state.js";
export type * from "./agent-state-provider.types.js";
export type * from "./agent-state-receipts.types.js";
export type * from "./agent-state-thread-requests.types.js";
export type * from "./agent-state-control-requests.types.js";
export type * from "./agent-thread-transition.types.js";
export * from "./agent-thread-transition.js";
