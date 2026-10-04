import { Context, Deferred, Effect, Exit, Layer, Ref } from "effect";
import { runOwnedContext } from "./work-ownership.js";
import { observeExecution } from "@relkit/contracts/operation";
import type { EnvShape } from "@relkit/config";
import type { TestRuntimeOptions, TestRuntimeCloseOptions } from "./runtime.js";
import type { RuntimeExecutionService } from "./runtime-execution.types.js";
import {
  invokeFunctionWithRunner,
  type StandaloneFunctionTarget,
  type FunctionInput,
  type FunctionOutput,
  type FunctionContextOf,
  type InvokeFunctionOptions,
} from "./invoke-function.js";
import { createTestContextFactory } from "./runtime-context.js";
import { createTestFakes } from "./fakes.js";
import { createTestStateRoot } from "./state-root.js";
import {
  TestDeterministicClock,
  deterministicClockLayer,
  combineSignals,
} from "./runtime-clock.js";
import { TestIdentity, identityLayer } from "./identity.js";
import { copyTestProviderReplacements } from "./provider-replacements.js";
import { resolveRuntimeEnv, validateRuntimeTimeout } from "./runtime-options.js";

import { closeRuntime } from "./runtime-close.js";

/** Owns invocation admission, cancellation, deterministic dependencies and shutdown. */
export class TestRuntimeExecution extends Context.Service<
  TestRuntimeExecution,
  RuntimeExecutionService
>()("relkit/testing/RuntimeExecution") {}

/**
 * Allocates a synchronously ready runtime domain service after validating all options.
 * @typeParam S Concrete environment declarations inferred from the application.
 * @param options Runtime declarations and explicit dependency replacements.
 * @returns A service Layer whose public owner is responsible for awaiting close.
 */
export function testRuntimeLayer<S extends EnvShape = EnvShape>(
  options: TestRuntimeOptions<S> = {},
) {
  return Layer.effect(
    TestRuntimeExecution,
    Effect.acquireRelease(
      Effect.gen(function* () {
        const deterministic = yield* TestDeterministicClock;
        const identity = yield* TestIdentity;
        const { closeTimeoutMs, resolvedEnv, providers } = yield* Effect.sync(() => {
          const closeTimeoutMs = options.closeTimeoutMs ?? 1_000;
          validateRuntimeTimeout(closeTimeoutMs);
          const resolvedEnv = resolveRuntimeEnv(options);
          const providers = copyTestProviderReplacements(options.providers);
          return { closeTimeoutMs, resolvedEnv, providers };
        });
        const root = yield* Effect.acquireRelease(
          Effect.sync(() => createTestStateRoot(options.stateRoot)),
          (root) => Effect.sync(() => root.cleanup(true)),
        );
        const fakes = yield* Effect.acquireRelease(
          Effect.sync(() =>
            createTestFakes(root.path, {
              clock: deterministic.clock.currentTimeMs,
              providers,
              ...(options.logger === undefined ? {} : { logger: options.logger }),
            }),
          ),
          (fakes) => Effect.promise(() => fakes.close()),
        );
        const executionContext = yield* Effect.context<never>();
        return yield* Effect.sync(() => {
          const runner = { run: deterministic.run };
          const ids = {
            next: (kind: Parameters<typeof identity.next>[0]) =>
              Effect.runSync(identity.next(kind)),
          };
          const controller = new AbortController();
          const context =
            options.context === undefined ? undefined : createTestContextFactory(options.context);
          const state = Ref.makeUnsafe({
            closed: false,
            failed: false,
            pending: new Set<Promise<unknown>>(),
            closing: undefined as Promise<void> | undefined,
          });

          /**
           * Admits one invocation before awaiting native work and releases its signal listeners.
           * @typeParam Target Descriptor carrying input, output and context inference.
           * @param target Function invoked through the existing engine validation path.
           * @param input Value validated by the descriptor's input schema.
           * @param callOptions Invocation-only overrides; runtime dependencies remain owner-local.
           * @returns An Effect with the existing validated result or original rejection.
           */
          const invoke = <Target extends StandaloneFunctionTarget>(
            target: Target,
            input: FunctionInput<Target>,
            callOptions?: Omit<
              InvokeFunctionOptions<FunctionContextOf<Target>>,
              "env" | "now" | "idSource"
            >,
          ): Effect.Effect<FunctionOutput<Target>, unknown> =>
            observeExecution(
              "testing",
              "runtime.invoke",
              Effect.fn("Testing.runtime.invoke")(function* () {
                const current = yield* Ref.get(state);
                if (current.closed) return yield* Effect.fail(new Error("Test runtime is closed"));
                return yield* Effect.tryPromise({
                  try: (fiberSignal) => {
                    const signal = combineSignals(
                      controller.signal,
                      callOptions?.signal,
                      fiberSignal,
                    );
                    const { context: callContext, ...invokeOptions } = callOptions ?? {};
                    const result = invokeFunctionWithRunner(
                      target,
                      input,
                      {
                        ...invokeOptions,
                        ...(options.registry === undefined ? {} : { registry: options.registry }),
                        env: resolvedEnv,
                        ...(callOptions?.clients === undefined ? { clients: fakes.clients } : {}),
                        now: deterministic.clock.currentTimeMs,
                        idSource: ids,
                        signal: signal.signal,
                        ...(callContext === undefined
                          ? context === undefined
                            ? {}
                            : {
                                context: context as unknown as InvokeFunctionOptions<
                                  FunctionContextOf<Target>
                                >["context"],
                              }
                          : { context: callContext }),
                      },
                      runner,
                    );
                    const tracked = result.then(
                      (value) => {
                        signal.dispose();
                        return value;
                      },
                      (error) => {
                        current.failed = true;
                        signal.dispose();
                        throw error;
                      },
                    );
                    current.pending.add(tracked);
                    void tracked.then(
                      () => current.pending.delete(tracked),
                      () => current.pending.delete(tracked),
                    );
                    return tracked;
                  },
                  catch: (cause) => cause,
                });
              })(),
            );

          return TestRuntimeExecution.of({
            value: Object.freeze({
              stateRoot: root.path,
              fakes,
              providers: fakes.providers,
              env: resolvedEnv,
              clock: deterministic.clock,
            }),
            invoke,
            close: (closeOptions: TestRuntimeCloseOptions = {}) =>
              Effect.uninterruptible(
                Effect.fn("Testing.runtime.close")(function* () {
                  const current = yield* Ref.get(state);
                  if (current.closing !== undefined)
                    return yield* Effect.tryPromise({
                      try: () => current.closing!,
                      catch: (cause) => cause,
                    });
                  const done = yield* Deferred.make<void, unknown>();
                  current.closing = runOwnedContext(executionContext, Deferred.await(done));
                  void current.closing.catch(() => undefined);
                  current.closed = true;
                  controller.abort(new Error("Test runtime closed"));
                  yield* observeExecution(
                    "testing",
                    "runtime.close",
                    closeRuntime(
                      current.pending,
                      closeTimeoutMs,
                      (failed) =>
                        Effect.gen(function* () {
                          const released = yield* Effect.exit(
                            Effect.tryPromise({
                              try: () => fakes.close(),
                              catch: (cause) => cause,
                            }),
                          );
                          root.cleanup(failed || Exit.isFailure(released));
                          if (Exit.isFailure(released))
                            return yield* Effect.failCause(released.cause);
                        }),
                      () => current.failed || closeOptions.failed === true,
                    ),
                  ).pipe(Effect.onExit((exit) => Deferred.done(done, exit)));
                })(),
              ),
          });
        });
      }),
      (service) => service.close().pipe(Effect.orDie),
    ),
  ).pipe(
    Layer.provide(
      Layer.mergeAll(deterministicClockLayer(options.startTimeMs ?? 0), identityLayer()),
    ),
  );
}
