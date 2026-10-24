/**
 * Owns worker for the optional local history store.
 * Shared records and query contracts come from lightweight observability; native
 * handles and worker lifetimes remain owned by this storage package.
 */
/**
 * Exposes IPC transport without evaluating the native DuckDB driver in its caller.
 * The isolated Node worker imports that driver in its own process. Its caller
 * retains the transport's explicit close operation and physical child identity.
 */
export { startLocalWorkerEffect } from "./worker-client-effect.js";
export type { LocalWorkerEffects } from "@relkit/observability/local/worker-contract";
export type { LocalWorkerError } from "@relkit/observability/local/worker-contract";
export type { LocalWorkerCommand } from "@relkit/observability/local/record";
