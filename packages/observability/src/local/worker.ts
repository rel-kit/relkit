/**
 * Exposes IPC transport without evaluating the native DuckDB driver in its caller.
 * The isolated Node worker imports that driver in its own process. Its caller
 * retains the transport's explicit close operation and physical child identity.
 */
export { startLocalWorkerEffect } from "./worker-client-effect.js";
export type { LocalWorkerEffects } from "./worker-client.types.js";
export type { LocalWorkerError } from "./worker-client-error.js";
export type { LocalWorkerCommand } from "./types.types.js";
