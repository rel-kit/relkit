import { AsyncLocalStorage } from "node:async_hooks";
import { Context, Effect, Fiber, Latch, Ref } from "effect";
import type { NativeLease, NativeLeaseContext } from "./native-leases.types.js";

const storage = new AsyncLocalStorage<NativeLeaseContext>();

/** Effect-local owner/physical-client leases, absent for independent callers. */
export const NativeLeases = Context.Reference<NativeLeaseContext>("@relkit/drizzle/NativeLeases", {
  defaultValue: () => ({}),
});

/**
 * Carries active parent leases into a new native Promise execution edge.
 * @typeParam A - Success value.
 * @typeParam E - Failure.
 * @typeParam R - Required services.
 * @param effect - New caller work.
 * @returns Work retaining only the current native parent's ephemeral leases.
 */
export function inheritNativeLeases<A, E, R>(effect: Effect.Effect<A, E, R>) {
  // A Deferred can synchronously resume an unrelated Effect fiber inside native
  // ALS. That fiber's own Context is authoritative, not the ambient native store.
  const fiber = Fiber.getCurrent();
  const inherited =
    fiber === undefined ? storage.getStore() : Context.get(fiber.context, NativeLeases);
  return inherited === undefined
    ? effect
    : effect.pipe(Effect.provideService(NativeLeases, inherited));
}

/**
 * Makes native SDK callbacks inherit the currently retained Effect leases.
 * @typeParam A - Native result.
 * @param leases - Effect-owned ephemeral capabilities.
 * @param run - Native SDK thunk.
 * @returns Native completion, including asynchronous SDK callback descendants.
 */
export function runWithNativeLeases<A>(leases: NativeLeaseContext, run: () => A): A {
  return storage.run(leases, run);
}

/**
 * Creates an Effect-owned descendant lease.
 * @param key - Exact owner or physical-client identity.
 * @returns A live token with no retained descendants.
 */
export const makeNativeLease = Effect.fn("Drizzle.nativeLease")((key: object) =>
  Effect.gen(function* () {
    return {
      key,
      state: yield* Ref.make({ accepting: true, closing: false, borrowers: 0 }),
      drained: yield* Latch.make(true),
    };
  }),
);

/**
 * Retains a still-active parent token atomically.
 * @param lease - Parent token.
 * @returns Whether the caller now owns a descendant lease.
 */
export function retainNativeLease(lease: NativeLease) {
  return Effect.uninterruptible(
    Effect.gen(function* () {
      const retained = yield* Ref.modify(lease.state, (state) =>
        state.accepting ? [true, { ...state, borrowers: state.borrowers + 1 }] : [false, state],
      );
      if (retained) yield* lease.drained.close;
      return retained;
    }),
  );
}

/**
 * Releases one retained descendant after safe native settlement.
 * @param lease - Retained parent token.
 * @returns Lazy release opening the parent's drain barrier when empty.
 */
export function releaseNativeLease(lease: NativeLease) {
  return Effect.uninterruptible(
    Effect.gen(function* () {
      const remaining = yield* Ref.modify(lease.state, (state) => [
        state.borrowers - 1,
        { ...state, borrowers: state.borrowers - 1 },
      ]);
      if (remaining === 0) yield* lease.drained.open;
    }),
  );
}

/**
 * Drains retained descendants, then atomically closes the token at zero.
 * @param lease - Owning token.
 * @returns Drain completion before the owning permit/admission may be released.
 */
export function closeNativeLease(lease: NativeLease) {
  return Effect.uninterruptible(
    Effect.gen(function* () {
      yield* Ref.update(lease.state, (state) => ({ ...state, closing: true }));
      // Retained children may invoke further native hooks before they settle.
      // Closing only at zero preserves that transitive capability without letting
      // any escaped callback enter after the owning scope actually releases.
      while (
        !(yield* Ref.modify(lease.state, (state) =>
          state.borrowers === 0 ? [true, { ...state, accepting: false }] : [false, state],
        ))
      ) {
        yield* lease.drained.await;
        yield* Effect.yieldNow;
      }
    }),
  );
}
