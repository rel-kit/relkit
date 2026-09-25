import { Effect } from "effect";
import { ObservabilityQueryError } from "../query-types.js";
import { LocalWorkerError } from "./worker-client-error.js";
import { startLocalWorkerEffect } from "./worker-client-effect.js";
import type { LocalWorkerCommand } from "./types.types.js";

export { LocalWorkerError } from "./worker-client-error.js";
export { startLocalWorkerEffect } from "./worker-client-effect.js";
export { LocalWorkerService, localWorkerLayer } from "./worker-client-service.js";
export type { LocalWorkerEffects } from "./worker-client.types.js";

const compatibilityError = (error: LocalWorkerError): Error =>
  error.code ? new ObservabilityQueryError(error.code, error.message) : new Error(error.message);

/**
 * Starts a local worker with the existing Promise API.
 *
 * @param onFailure - Receives the first unexpected worker failure.
 * @returns A live worker with Promise based `call` and `close` methods.
 * @throws {Error} If process creation fails.
 * @example
 * const worker = startLocalWorker();
 * try { await worker.call({ type: "flush" }); } finally { await worker.close(); }
 */
export function startLocalWorker(onFailure: (error: Error) => void = () => undefined) {
  const worker = Effect.runSync(
    startLocalWorkerEffect(onFailure).pipe(
      Effect.catchTag("LocalWorkerError", (error) =>
        Effect.sync(() => {
          throw compatibilityError(error);
        }),
      ),
    ),
  );
  const legacy = <A>(effect: Effect.Effect<A, LocalWorkerError>): Promise<A> =>
    Effect.runPromise(
      effect.pipe(
        Effect.catchTag("LocalWorkerError", (error) => Effect.fail(compatibilityError(error))),
      ),
    );
  return {
    pid: worker.pid,
    call: <T>(command: LocalWorkerCommand): Promise<T> =>
      legacy(worker.call(command)) as Promise<T>,
    close: (): Promise<void> => legacy(worker.close()),
  };
}
