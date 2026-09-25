import type { Effect } from "effect";
import type { LocalWorkerError } from "./worker-client-error.js";
import type { LocalWorkerCommand } from "./types.types.js";

/**
 * Effect operations for a live local telemetry worker process.
 * The owning Layer or caller must close the worker after its final call.
 *
 * @example
 * const worker = Effect.runSync(startLocalWorkerEffect());
 * await Effect.runPromise(worker.close());
 */
export interface LocalWorkerEffects {
  readonly pid: number | undefined;
  /** @param command - Worker IPC command. @returns Its response or a tagged worker error. */
  readonly call: (command: LocalWorkerCommand) => Effect.Effect<unknown, LocalWorkerError>;
  /** @returns Completion after the worker process and pending calls are released. */
  readonly close: () => Effect.Effect<void, LocalWorkerError>;
}
