import { Context, Effect, Latch, Layer, Ref } from "effect";
import { DrizzleFailure, nativeCall } from "./failure.js";
import type { DrizzleServiceRuntime } from "./runtime-types.js";
import type { DrizzleOwnerInterface, OwnerBinding } from "./owner.types.js";
import { observeSpecializedOperation } from "./operation-tracing.js";
import { redactSpecializedTrace } from "./trace-redaction.js";
import {
  closeNativeLease,
  inheritNativeLeases,
  makeNativeLease,
  NativeLeases,
  releaseNativeLease,
  retainNativeLease,
} from "./native-leases.js";

/**
 * Client lifetime/admission contract, substitutable through live/test Layers.
 * @see {@link drizzleOwnerLayer} for checked acquisition/provisioning/cleanup composition.
 */
export class DrizzleOwner extends Context.Service<DrizzleOwner, DrizzleOwnerInterface>()(
  "@relkit/drizzle/Owner",
) {}

/** Weak association preserving the exact frozen public activation shape. */
export const owners = new WeakMap<object, OwnerBinding>();

/**
 * Acquires one client into a Layer scope.
 * @param declaration - Native acquisition/disposal dependencies.
 * @param env - First activation environment.
 * @returns A live owner Layer; its scope releases the client exactly once.
 * @example
 * ```ts
 * import { ManagedRuntime } from "effect";
 * import { sqliteTable, integer } from "drizzle-orm/sqlite-core";
 * import { defineDrizzleService } from "@relkit/drizzle";
 * import { DrizzleOwner, drizzleOwnerLayer, drizzleRuntimeOf } from "@relkit/drizzle/internal";
 * const records = sqliteTable("records", { id: integer().primaryKey() });
 * const declaration = drizzleRuntimeOf(defineDrizzleService({ schema: { records }, client: () => ({}) }));
 * const owner = ManagedRuntime.make(drizzleOwnerLayer(declaration, {}));
 * try { await owner.runPromise(DrizzleOwner); }
 * finally { await owner.dispose(); }
 * ```
 */
export function drizzleOwnerLayer(
  declaration: DrizzleServiceRuntime,
  env: Readonly<Record<string, unknown>>,
) {
  return Layer.effect(
    DrizzleOwner,
    redactSpecializedTrace(
      Effect.gen(function* () {
        // The release closure must also drain callers executing through a native
        // Effect context outside ManagedRuntime's own fiber scope.
        let service: DrizzleOwnerInterface | undefined;
        const client = yield* Effect.acquireRelease(
          observeSpecializedOperation(
            "database.acquire",
            nativeCall("acquire", () => declaration.client({ env })),
          ),
          (client) =>
            Effect.gen(function* () {
              if (service !== undefined) {
                yield* service.beginClose();
                yield* service.awaitDrained();
              }
              yield* observeSpecializedOperation(
                "database.close",
                nativeCall("close", () => declaration.dispose?.(client)),
              ).pipe(
                Effect.mapError((failure) => failure.cause),
                Effect.orDie,
              );
            }),
        );
        service = yield* makeDrizzleOwner(client);
        return service;
      }),
    ),
  );
}

/**
 * Creates the service contract for live acquisition or deterministic fake clients.
 * @param client - Client owned by the enclosing Layer scope.
 * @returns Lazy owner state and named admission/shutdown workflows.
 * @see {@link drizzleOwnerLayer} for the owning Layer and execution boundary.
 */
export const makeDrizzleOwner = Effect.fn("Drizzle.owner")((client: unknown) =>
  Effect.gen(function* () {
    const admission = yield* Ref.make({ closing: false, active: 0 });
    const drained = yield* Latch.make(true);
    return DrizzleOwner.of({
      client,
      admission,
      drained,
      work: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        redactSpecializedTrace(
          Effect.fn("Drizzle.admit")((work: Effect.Effect<A, E, R>) =>
            admitOwnerWork(admission, drained, work),
          )(effect),
        ),
      beginClose: Effect.fn("Drizzle.beginClose")(() =>
        Ref.update(admission, (state) => ({ ...state, closing: true })),
      ),
      awaitDrained: Effect.fn("Drizzle.awaitDrained")(() =>
        Effect.gen(function* () {
          // Atomic admission is authoritative; scheduler yielding can expose the
          // short interval between a count transition and its latch transition.
          while ((yield* Ref.get(admission)).active !== 0) {
            yield* drained.await;
            yield* Effect.yieldNow;
          }
        }),
      ),
    });
  }),
);

/**
 * Admits lazy work and releases its lease after safe native settlement.
 * @typeParam A - Success value.
 * @typeParam E - Caller failure.
 * @typeParam R - Caller services, retained without hidden provisioning.
 * @param activation - Frozen activation associated with its owner.
 * @param effect - Lazy work; SDK adapters must wait for native completion.
 * @returns The original effect with a typed closed-owner failure.
 * @example Compose work with an existing activation
 * ```ts
 * import { Effect } from "effect";
 * import { activateDrizzleService } from "@relkit/drizzle";
 * import { withDrizzleWork } from "@relkit/drizzle/internal";
 * function borrowedWork(active: Awaited<ReturnType<typeof activateDrizzleService>>) {
 *   return withDrizzleWork(active, Effect.succeed(1));
 * }
 * ```
 */
export function withDrizzleWork<A, E, R>(
  activation: object,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | DrizzleFailure, R> {
  return Effect.suspend(() => {
    const owner = owners.get(activation)?.service;
    if (owner === undefined)
      return Effect.fail(
        new DrizzleFailure({
          operation: "admission",
          cause: new TypeError("Invalid Drizzle activation"),
        }),
      );
    return owner.work(effect);
  });
}

/**
 * Owns the atomic admission/release transition for one caller.
 * @typeParam A - Success value.
 * @typeParam E - Caller failure.
 * @typeParam R - Caller services.
 * @param admission - Shared atomic owner state.
 * @param drained - Gate opened when all leases settle.
 * @param effect - Lazy caller work.
 * @returns Admitted effect or a typed closed-owner failure.
 */
function admitOwnerWork<A, E, R>(
  admission: DrizzleOwnerInterface["admission"],
  drained: Latch.Latch,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | DrizzleFailure, R> {
  return Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const leases = yield* NativeLeases;
      if (leases.owner?.key === admission && (yield* retainNativeLease(leases.owner)))
        return yield* restore(effect).pipe(Effect.ensuring(releaseNativeLease(leases.owner)));
      const admitted = yield* Ref.modify(admission, (state) =>
        state.closing ? [false, state] : [true, { ...state, active: state.active + 1 }],
      );
      if (!admitted)
        return yield* Effect.fail(
          new DrizzleFailure({
            operation: "admission",
            cause: new TypeError("Drizzle activation is closed"),
          }),
        );
      yield* drained.close;
      const lease = yield* makeNativeLease(admission);
      return yield* restore(effect).pipe(
        Effect.provideService(NativeLeases, { ...leases, owner: lease }),
        Effect.ensuring(
          Effect.gen(function* () {
            yield* closeNativeLease(lease);
            const remaining = yield* Ref.modify(admission, (state) => [
              state.active - 1,
              { ...state, active: state.active - 1 },
            ]);
            if (remaining === 0) yield* drained.open;
          }),
        ),
      );
    }),
  );
}

/**
 * Reads the observation context captured at activation.
 * @param activation - Database owner borrowed by another specialized service.
 * @returns Logger/tracer/metric context without additional client authority.
 */
export function drizzleInstrumentationOf(activation: object): Context.Context<never> {
  return owners.get(activation)?.instrumentation ?? Context.empty();
}

/**
 * Executes one admitted Promise compatibility edge.
 * @typeParam A - Success value.
 * @typeParam E - Operation failure.
 * @param activation - Database owner.
 * @param effect - Already instrumented lazy operation.
 * @returns Its public result, preserving native error identity.
 * @see {@link withDrizzleWork} for the equivalent Effect-native borrowed lease.
 */
export function runDrizzleWorkPromise<A, E>(
  activation: object,
  effect: Effect.Effect<A, E>,
): Promise<A> {
  const owner = owners.get(activation);
  if (owner === undefined) return Promise.reject(new TypeError("Invalid Drizzle activation"));
  return owner.run(inheritNativeLeases(withDrizzleWork(activation, effect)));
}
