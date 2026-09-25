import { Context, Effect, Layer } from "effect";
import { startLocalWorkerEffect } from "./worker-client-effect.js";
import type { LocalWorkerEffects } from "./worker-client.types.js";

/**
 * Injectable local worker operations. A Layer owns the worker process until
 * its scope closes, so callers can substitute a deterministic service in tests.
 *
 * @example
 * const program = Effect.gen(function* () {
 *   const worker = yield* LocalWorkerService;
 *   return worker.pid;
 * });
 */
export class LocalWorkerService extends Context.Service<LocalWorkerService, LocalWorkerEffects>()(
  "@relkit/observability/LocalWorkerService",
) {}

/**
 * Acquires a worker for the Layer scope and releases it on every exit.
 *
 * @param onFailure - Receives the first unexpected worker failure.
 * @returns A Layer providing `LocalWorkerService`.
 * @example
 * const result = await Effect.runPromise(program.pipe(Effect.provide(localWorkerLayer())));
 */
export const localWorkerLayer = (onFailure?: (error: Error) => void) =>
  Layer.effect(
    LocalWorkerService,
    Effect.acquireRelease(startLocalWorkerEffect(onFailure), (worker) =>
      Effect.ignore(worker.close()),
    ),
  );
