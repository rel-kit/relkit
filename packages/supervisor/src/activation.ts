import { Context, Effect, Exit, Layer, Ref, Result } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { planActivation, planCandidate, planDrain, planSourceChange } from "./activation-plan.js";
import { ActivationTransitionError } from "./state-machine.schemas.js";
import { validateSupervisorToken } from "./state-machine-telemetry.js";
import { publishActivation } from "./activation-publish.js";
import type { ActivationPublicationState } from "./activation-publish.types.js";
import type { ActivationService, ActivationTransition } from "./activation.types.js";
import type {
  SupervisorStateMachineOptions,
  SupervisorStateSnapshot,
  SupervisorTelemetry,
  SupervisorTelemetryListener,
} from "./state-machine.types.js";

/** Activation decisions and retained lifecycle evidence for one supervisor owner. */
export class SupervisorActivation extends Context.Service<
  SupervisorActivation,
  ActivationService
>()("relkit/supervisor/Activation") {}

/**
 * Acquires synchronous activation state once; no native worker or handle is retained.
 * @param options - Initial active identity and native evidence observer.
 * @returns The same service contract used by live callers and deterministic test Layers.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { SupervisorActivation, createActivationLayer } from "./activation.js";
 * export function selectGeneration(): void {
 * const candidate = Effect.flatMap(SupervisorActivation, (owner) => owner.sourceChanged());
 * const token = Effect.runSync(candidate.pipe(Effect.provide(createActivationLayer())));
 * }
 * ```
 */
export function createActivationLayer(
  options: SupervisorStateMachineOptions = {},
): Layer.Layer<SupervisorActivation, TypeError> {
  return Layer.effect(
    SupervisorActivation,
    Effect.gen(function* () {
      const active = options.activeGeneration;
      if (active !== undefined) yield* validateToken(active);
      const snapshot = yield* Ref.make<SupervisorStateSnapshot>(
        Object.freeze({
          state: active === undefined ? "idle" : "active",
          sourceToken: active?.sourceToken ?? 0,
          generationToken: active?.generationToken ?? 0,
          candidate: undefined,
          activeGeneration: active === undefined ? undefined : Object.freeze({ ...active }),
          previousGeneration: undefined,
        }),
      );
      const events = yield* Ref.make<readonly SupervisorTelemetry[]>([]);
      const listeners = yield* Ref.make<ReadonlySet<SupervisorTelemetryListener>>(
        new Set(options.onTelemetry === undefined ? [] : [options.onTelemetry]),
      );
      const publications = yield* Ref.make<ActivationPublicationState>({
        publishing: false,
        pending: [],
      });

      /**
       * Commits a complete state decision before any potentially reentrant listener executes.
       * @typeParam A - Original synchronous method result.
       * @typeParam E - Expected boundary validation failure.
       * @param operation - Declaration-owned label.
       * @param plan - Pure synchronous decision evaluated inside one Ref.modify.
       * @param failed - Whether this accepted completion represents a domain failure.
       * @param validate - Synchronous validation included in the observed operation.
       * @returns The original result, with typed state failures and isolated observation.
       */
      const transact = <A, E = never>(
        operation: string,
        plan: (current: SupervisorStateSnapshot) => ActivationTransition<A>,
        failed = false,
        validate: Effect.Effect<void, E> = Effect.void,
      ): Effect.Effect<A, ActivationTransitionError | E> =>
        observeExecution(
          "supervisor",
          operation,
          Effect.gen(function* () {
            yield* validate;
            const planned = yield* Ref.modify(
              snapshot,
              (
                current,
              ): readonly [
                Result.Result<ActivationTransition<A>, ActivationTransitionError>,
                SupervisorStateSnapshot,
              ] => {
                try {
                  const next = plan(current);
                  return [Result.succeed(next), next.snapshot] as const;
                } catch (error) {
                  if (!(error instanceof ActivationTransitionError)) throw error;
                  return [Result.fail(error), current] as const;
                }
              },
            );
            if (Result.isFailure(planned)) return yield* Effect.fail(planned.failure);
            yield* publishActivation(planned.success.records, events, listeners, publications);
            return planned.success.value;
          }),
          () => ({ transitions: 1 }),
          failed ? (exit) => (Exit.isSuccess(exit) ? "failure" : true) : undefined,
        );

      return SupervisorActivation.of({
        snapshot: Ref.get(snapshot),
        telemetry: Ref.get(events).pipe(Effect.map((records) => records.slice())),
        sourceChanged: Effect.fn("SupervisorActivation.sourceChanged")(() =>
          transact("activation.source-change", planSourceChange),
        ),
        complete: Effect.fn("SupervisorActivation.complete")((phase, token, success, reason) =>
          transact(
            `activation.${phase}.${success ? "succeeded" : "failed"}`,
            (current) => planCandidate(current, phase, token, success, reason),
            !success,
            validateToken(token),
          ),
        ),
        activate: Effect.fn("SupervisorActivation.activate")((token) =>
          transact(
            "activation.switch",
            (current) => planActivation(current, token),
            false,
            validateToken(token),
          ),
        ),
        drained: Effect.fn("SupervisorActivation.drained")((token, outcome, reason) =>
          transact(
            "activation.drain",
            (current) => planDrain(current, token, outcome, reason),
            outcome === "drain-failed",
            validateToken(token),
          ),
        ),
        subscribe: Effect.fn("SupervisorActivation.subscribe")((listener) =>
          Ref.update(listeners, (current) => new Set([...current, listener])),
        ),
        unsubscribe: Effect.fn("SupervisorActivation.unsubscribe")((listener) =>
          Ref.update(listeners, (current) => {
            const next = new Set(current);
            next.delete(listener);
            return next;
          }),
        ),
      });
    }),
  );
}

/**
 * Preserves existing TypeError messages while treating unexpected getter failures as defects.
 * @param token - Boundary candidate identity.
 * @returns Synchronous validation of its positive safe-integer fields.
 */
function validateToken(
  token: import("./state-machine.types.js").SupervisorCandidateToken,
): Effect.Effect<void, TypeError> {
  return Effect.try({
    try: () => validateSupervisorToken(token),
    catch: (error) => {
      if (error instanceof TypeError) return error;
      throw error;
    },
  });
}
