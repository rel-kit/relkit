/**
 * Exposes the development bridge and private discovery contract to CLI and the
 * standalone inspector. This entrypoint has no compiler, UI, database or native
 * agent implementation dependency; consumers own provided I/O Layer lifetimes.
 */
export * from "./connection/protocol.schemas.js";
export type * from "./connection/protocol.types.js";
export type * from "./connection/bridge.types.js";
export * from "./connection/connection-error.js";
export * from "./connection/files.service.js";
export * from "./connection/native.service.js";
export * from "./connection/bridge.service.js";
export { createInspectionHandler } from "./connection/bridge-handler.js";
export * from "./connection/capture.service.js";
export type * from "./connection/capture.types.js";
export { inspectionReplayRecord } from "./connection/replay-record.js";
