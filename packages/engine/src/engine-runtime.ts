import type { InvocationRunner } from "@relkit/invocation";
import { currentNativeEffectContext, withNativeEffectContext } from "@relkit/runtime-effect";
import { Cause, Context, Effect, Exit, Logger } from "effect";

// Carries the existing fiber environment across native callbacks. Invocation identity
// and tracing remain owned by @relkit/invocation.
const quiet = Context.make(Logger.CurrentLoggers, new Set<Logger.Logger<unknown, unknown>>());

/** Preserve explicit sinks while keeping unconfigured native adapters silent.
 * @returns The inherited Effect environment with an explicit quiet default logger.
 */
function nativeContext(): Context.Context<never> {
  const context = currentNativeEffectContext() ?? Context.empty();
  return context.mapUnsafe.has(Logger.CurrentLoggers.key) ? context : Context.merge(context, quiet);
}

/** Execute a synchronous compatibility boundary while retaining public error identity.
 * @typeParam A - Successful value.
 * @typeParam E - Typed domain failure.
 * @param program - Fully provided, synchronously completing operation.
 * @returns The operation result; typed failures and defects are thrown unchanged.
 */
export function runEngineSync<A, E>(program: Effect.Effect<A, E>): A {
  const exit = Effect.runSyncExit(Effect.provide(program, nativeContext()));
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}

/** Execute an engine Promise boundary without wrapping existing public errors.
 * @typeParam A - Successful value.
 * @typeParam E - Typed domain failure.
 * @param program - Fully provided engine operation.
 * @param signal - Optional caller cancellation signal.
 * @param runner - Existing configured runtime; nested native callbacks retain its services.
 * @returns A Promise containing the result, rejecting with the original failure.
 */
export async function runEnginePromise<A, E>(
  program: Effect.Effect<A, E>,
  signal?: AbortSignal,
  runner?: InvocationRunner,
): Promise<A> {
  const options = signal === undefined ? undefined : { signal };
  const exit =
    runner === undefined
      ? await Effect.runPromiseExit(Effect.provide(program, nativeContext()), options)
      : await runner.run(
          Effect.exit(
            Effect.withFiber((fiber) =>
              fiber.context.mapUnsafe.has(Logger.CurrentLoggers.key)
                ? program
                : Effect.provide(program, quiet),
            ),
          ),
          options,
        );
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}

/** Adapt the configured handler runner without dropping native-boundary dependencies.
 * @param runner - Existing runtime runner, or undefined for the quiet default.
 * @returns A shared-kernel runner preserving native failure identity and configured sinks.
 */
export function engineRunner(runner?: InvocationRunner): InvocationRunner {
  return { run: (effect, options) => runEnginePromise(effect, options?.signal, runner) };
}

/** Suspend a native adapter call and retain its failure value for boundary translation.
 * @typeParam A - Native result.
 * @param operation - Abort-aware native operation.
 * @returns A lazy effect failing with the original native rejection.
 */
export function enginePromise<A>(
  operation: (signal: AbortSignal) => PromiseLike<A>,
): Effect.Effect<A, unknown> {
  return Effect.withFiber((fiber) =>
    Effect.tryPromise({
      try: (signal) => withNativeEffectContext(fiber.context, () => operation(signal)),
      catch: (cause) => cause,
    }),
  );
}

/** Suspend validation that intentionally throws a public compatibility error.
 * @typeParam A - Validated result.
 * @param operation - Synchronous validation or factory.
 * @returns A lazy effect with the original thrown value in its failure channel.
 */
export function engineTry<A>(operation: () => A): Effect.Effect<A, unknown> {
  return Effect.withFiber((fiber) =>
    Effect.try({
      try: () => withNativeEffectContext(fiber.context, operation),
      catch: (cause) => cause,
    }),
  );
}
