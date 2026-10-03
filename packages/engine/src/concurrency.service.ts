import { observeExecution } from "@relkit/runtime-effect";
import { Context, Effect, Layer } from "effect";
import { AdmissionState } from "./concurrency-state.js";
import type { AdmissionOperations, ConcurrencyAdmissionOptions } from "./concurrency.types.js";

/** Effect admission contract, with one coordinated FIFO owner per generation. */
export class AdmissionService extends Context.Service<AdmissionService, AdmissionOperations>()(
  "@relkit/engine/Admission",
) {}

/** Construct admission authority with explicit generation lease ownership.
 * @param options - Generation facade and identity.
 * @returns A live Layer with isolated capacity state.
 * @example
 * ```ts
 * const layer = admissionLayer();
 * const program = Effect.gen(function* () {
 *   const admission = yield* AdmissionService;
 *   const lease = yield* admission.acquire({ functionId: "orders.get", source: "direct", signal: new AbortController().signal });
 *   yield* Effect.sync(() => lease.release());
 * }).pipe(Effect.provide(layer));
 * await Effect.runPromise(program);
 * ```
 */
export function admissionLayer(options: ConcurrencyAdmissionOptions = {}) {
  return Layer.effect(AdmissionService, makeAdmission(options));
}

/** Allocate one coordinated FIFO owner and expose its Effect operations.
 * @param options - Generation identity and admission-time lease authority.
 * @returns A lazy Effect allocating independent capacity state.
 * @see admissionLayer for the checked live/test composition example.
 */
export const makeAdmission = Effect.fn("Engine.admission.make")(
  (options: ConcurrencyAdmissionOptions = {}) =>
    Effect.sync(() => {
      const state = new AdmissionState(options);
      return AdmissionService.of({
        acquire: state.acquireEffect,
        activeCount: Effect.fn("Engine.admission.activeCount")((id: string) =>
          observeExecution(
            "engine",
            "admission.activeCount",
            Effect.sync(() => state.activeCount(id)),
          ),
        ),
        waitingCount: Effect.fn("Engine.admission.waitingCount")((id: string) =>
          observeExecution(
            "engine",
            "admission.waitingCount",
            Effect.sync(() => state.waitingCount(id)),
          ),
        ),
      });
    }),
);
