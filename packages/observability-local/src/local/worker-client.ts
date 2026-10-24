/**
 * Owns worker client for the optional local history store.
 * Shared records and query contracts come from lightweight observability; native
 * handles and worker lifetimes remain owned by this storage package.
 */
import { Effect } from "effect";
import { ObservabilityQueryError } from "@relkit/observability";
import { LocalWorkerError } from "@relkit/observability/local/worker-contract";
import { startLocalWorkerEffect } from "./worker-client-effect.js";
import type { LocalWorkerCommand } from "@relkit/observability/local/record";

export { LocalWorkerError } from "@relkit/observability/local/worker-contract";
export { startLocalWorkerEffect } from "./worker-client-effect.js";
export { LocalWorkerService, localWorkerLayer } from "./worker-client-service.js";
export type { LocalWorkerEffects } from "@relkit/observability/local/worker-contract";

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
