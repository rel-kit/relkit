import { Data, Effect, Exit, Option, Scope } from "effect";
import { AbortIO } from "./abort.js";
import { observeInvocation, runInvocationSync } from "./invocation-observability.js";
import { publicTrace } from "./public-trace.js";
import type {
  InvocationContextOptions,
  InvocationRecord,
  MaybePromise,
  PublicClock,
  SignalLinkHandle,
} from "./context.types.js";

/** Tagged failure from a supplied context factory.
 * @example Effect.catchTag(makeContextEffect(factory, record, signal, {}, time), "ContextFactoryFailure", () => Effect.void);
 */
export class ContextFactoryFailure extends Data.TaggedError("ContextFactoryFailure")<{
  readonly cause: unknown;
  readonly message: string;
}> {}

/** Builds a frozen public invocation context through Effect.
 * @param factory - Optional custom context factory.
 * @param record - Current invocation record.
 * @param signal - Handler-visible abort signal.
 * @param env - Environment values copied into the context.
 * @param time - Public invocation clock.
 * @returns A frozen context or ContextFactoryFailure.
 * @example Effect.runPromise(makeContextEffect(undefined, record, signal, {}, time));
 */
export function makeContextEffect<Context extends { readonly signal: AbortSignal }>(
  factory: ((options: InvocationContextOptions) => MaybePromise<Context>) | undefined,
  record: InvocationRecord,
  signal: AbortSignal,
  env: Readonly<Record<string, unknown>>,
  time: PublicClock,
): Effect.Effect<Context, ContextFactoryFailure> {
  return observeInvocation(
    "context.create",
    Effect.gen(function* () {
      const options = { invocation: record, signal, env: Object.freeze({ ...env }), time };
      if (factory !== undefined) {
        const context = yield* Effect.tryPromise({
          try: () => Promise.resolve(factory(options)),
          catch: (cause) => new ContextFactoryFailure({ cause, message: "Context factory failed" }),
        });
        return Object.freeze({ ...context, trace: publicTrace }) as Context;
      }
      const noop = (): void =>
        runInvocationSync(observeInvocation("context.log-noop", Effect.void));
      return Object.freeze({
        invocation: record,
        trace: publicTrace,
        signal,
        env: options.env,
        log: Object.freeze({ trace: noop, debug: noop, info: noop, warn: noop, error: noop }),
        time,
        tasks: Object.freeze({}),
        jobs: Object.freeze({}),
        events: Object.freeze({}),
        buckets: Object.freeze({}),
        cache: Object.freeze({}),
        agents: Object.freeze({}),
        database: Object.freeze({}),
        auth: Object.freeze({
          getSession: () =>
            Effect.runPromise(observeInvocation("context.session", Effect.succeed(null))),
        }),
        constants: Object.freeze({}),
        prompts: Object.freeze({}),
      }) as unknown as Context;
    }),
  );
}

/** Promise compatibility adapter for public context creation.
 * @param factory - Optional custom context factory.
 * @param record - Current invocation record.
 * @param signal - Handler-visible abort signal.
 * @param env - Environment values copied into the context.
 * @param time - Public invocation clock.
 * @returns A frozen context.
 * @throws The original custom factory failure.
 * @example await makeContext(undefined, record, signal, {}, time);
 */
export async function makeContext<Context extends { readonly signal: AbortSignal }>(
  factory: ((options: InvocationContextOptions) => MaybePromise<Context>) | undefined,
  record: InvocationRecord,
  signal: AbortSignal,
  env: Readonly<Record<string, unknown>>,
  time: PublicClock,
): Promise<Context> {
  try {
    return await Effect.runPromise(makeContextEffect(factory, record, signal, env, time));
  } catch (cause) {
    if (cause instanceof ContextFactoryFailure) throw cause.cause;
    throw cause;
  }
}

/** Links supplied abort signals to a controller through Effect.
 * @param controller - Controller aborted by any supplied signal.
 * @param signals - Signals to link, ignoring undefined entries.
 * @returns Explicit Effect and synchronous cleanup; no expected failure.
 * @example Effect.runSync(linkSignalsEffect(controller, [parent.signal]));
 */
export function linkSignalsEffect(
  controller: AbortController,
  signals: readonly (AbortSignal | undefined)[],
): Effect.Effect<SignalLinkHandle> {
  return observeInvocation(
    "context.link-signals",
    Effect.flatMap(Effect.serviceOption(AbortIO), (provided) =>
      Effect.gen(function* () {
        const listen = Option.isSome(provided)
          ? provided.value.listen
          : (signal: AbortSignal, onAbort: () => void): (() => void) => {
              signal.addEventListener("abort", onAbort, { once: true });
              return () => signal.removeEventListener("abort", onAbort);
            };
        const scope = yield* Scope.make();
        yield* Scope.provide(
          Effect.gen(function* () {
            for (const signal of signals) {
              if (signal === undefined) continue;
              const abort = (): void => controller.abort(signal.reason);
              if (signal.aborted) {
                abort();
                continue;
              }
              yield* Effect.acquireRelease(
                Effect.sync(() => listen(signal, abort)),
                (unlink) => Effect.sync(unlink),
              );
              if (signal.aborted) abort();
            }
          }).pipe(Effect.onError(() => Scope.close(scope, Exit.void))),
          scope,
        );
        const unlinkEffect = (): Effect.Effect<void> =>
          observeInvocation("context.unlink-signals", Scope.close(scope, Exit.void));
        return { unlinkEffect, unlink: () => runInvocationSync(unlinkEffect()) };
      }),
    ),
  );
}

/** Synchronous linked-signal compatibility adapter.
 * @param controller - Controller aborted by any supplied signal.
 * @param signals - Signals to link, ignoring undefined entries.
 * @returns Idempotent listener cleanup.
 * @throws A defect if listener registration fails.
 * @example const unlink = linkSignals(controller, [parent.signal]);
 */
export function linkSignals(
  controller: AbortController,
  signals: readonly (AbortSignal | undefined)[],
): () => void {
  return runInvocationSync(linkSignalsEffect(controller, signals)).unlink;
}
