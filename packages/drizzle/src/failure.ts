import { Cause, Effect, Exit, Schema } from "effect";
import type { ManagedRuntime } from "effect";
import { NativeLeases, runWithNativeLeases } from "./native-leases.js";

/** Expected native database, validation or owner-admission failure. */
export class DrizzleFailure extends Schema.TaggedError<DrizzleFailure>()("DrizzleFailure", {
  operation: Schema.String,
  cause: Schema.Defect(),
}) {}

/**
 * Suspends an uncancellable SDK call until actual completion.
 * @typeParam A - Native success value.
 * @param operation - Bounded diagnostic label.
 * @param run - Native call, invoked only during execution.
 * @returns A lazy typed effect; interruption waits for native settlement.
 * @remarks Drizzle's generic query contract has no AbortSignal parameter.
 * @see {@link runDrizzlePromise} for execution at the owning runtime boundary.
 */
export function nativeCall<A>(operation: string, run: () => A | PromiseLike<A>) {
  return Effect.uninterruptible(
    Effect.flatMap(NativeLeases, (leases) =>
      Effect.tryPromise({
        try: () => runWithNativeLeases(leases, () => Promise.resolve().then(run)),
        catch: (cause) => new DrizzleFailure({ operation, cause }),
      }),
    ),
  );
}

/**
 * Executes a compatibility edge retaining original native rejection identity.
 * @typeParam A - Success value.
 * @typeParam E - Operation failure.
 * @typeParam R - Owner services.
 * @typeParam ER - Layer acquisition failure.
 * @param runtime - Existing managed owner.
 * @param effect - Lazy operation.
 * @param options - Optional caller cancellation.
 * @returns The public result; mixed causes retain primary/cleanup reasons.
 * @example
 * ```ts
 * import { Effect, Layer, ManagedRuntime } from "effect";
 * import { runDrizzlePromise } from "@relkit/drizzle/internal";
 * const owner = ManagedRuntime.make(Layer.empty);
 * try { await runDrizzlePromise(owner, Effect.succeed(1)); }
 * finally { await owner.dispose(); }
 * ```
 */
export async function runDrizzlePromise<A, E, R, ER>(
  runtime: ManagedRuntime.ManagedRuntime<R, ER>,
  effect: Effect.Effect<A, E, R>,
  options?: Effect.RunOptions,
): Promise<A> {
  const exit = await runtime.runPromiseExit(effect, options);
  if (Exit.isSuccess(exit)) return exit.value;
  throw squashDrizzleCause(exit.cause);
}

/**
 * Translates one native failure without erasing mixed cleanup/interruption causes.
 * @typeParam E - Internal typed failure.
 * @param cause - Authoritative Effect cause.
 * @returns The original lone rejection, or an AggregateError retaining all reasons.
 */
export function squashDrizzleCause<E>(cause: Cause.Cause<E>): unknown {
  const translated = Cause.map(cause, (error) =>
    error instanceof DrizzleFailure ? error.cause : error,
  );
  if (translated.reasons.length <= 1) return Cause.squash(translated);
  const errors = translated.reasons.map((reason) =>
    reason._tag === "Fail"
      ? reason.error
      : reason._tag === "Die"
        ? reason.defect
        : new Error("Drizzle work interrupted"),
  );
  return new AggregateError(errors, "Drizzle work and cleanup failed", { cause: translated });
}
