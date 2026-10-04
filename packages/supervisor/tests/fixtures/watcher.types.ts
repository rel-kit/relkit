import type { SupervisorCompileRequest } from "../../src/watcher.types.js";

/** Recorded compiler inputs retain only the native fixture fields asserted by compatibility tests. */
export type RecordedWatcherBatch = Pick<SupervisorCompileRequest, "version" | "changedFiles">;
