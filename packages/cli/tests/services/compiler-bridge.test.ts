import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Exit, Fiber, Scope } from "effect";
import { makeDevCompilerBridgeEffect } from "../../src/commands/dev-compiler-bridge.js";
import type { CandidateCompileRequest } from "@relkit/supervisor";

/**
 * Creates one accepted foreign supervisor request for deterministic bridge tests.
 * @param controller - Caller-owned cancellation.
 * @param generation - Positive generation identity.
 * @returns Data-only compiler input.
 */
function request(controller: AbortController, generation = 1): CandidateCompileRequest {
  return {
    token: { sourceToken: generation, generationToken: generation },
    projectRoot: "/project",
    outputDirectory: `/generation-${generation}`,
    signal: controller.signal,
  };
}

it.live("foreign cancellation joins compiler release before rejecting the same reason", () =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    const entered = yield* Deferred.make<void>();
    const releasing = yield* Deferred.make<void>();
    const released = yield* Deferred.make<void>();
    const bridge = yield* makeDevCompilerBridgeEffect(
      () =>
        Deferred.succeed(entered, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.ensuring(
            Deferred.succeed(releasing, undefined).pipe(Effect.andThen(Deferred.await(released))),
          ),
        ),
      scope,
    );
    const controller = new AbortController();
    const reason = new Error("Generation superseded.");
    let settled = false;
    const result = Promise.resolve(bridge.compile(request(controller))).then(
      () => undefined,
      (error: unknown) => {
        settled = true;
        return error;
      },
    );
    yield* Deferred.await(entered);
    controller.abort(reason);
    yield* Deferred.await(releasing);
    expect(settled).toBe(false);
    yield* Deferred.succeed(released, undefined);
    expect(yield* Effect.promise(() => result)).toBe(reason);
    yield* Scope.close(scope, Exit.void);
  }),
);

it.live("closing joins active compilation and rejects every queued caller", () =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    const entered = yield* Deferred.make<void>();
    const releasing = yield* Deferred.make<void>();
    const released = yield* Deferred.make<void>();
    let calls = 0;
    const bridge = yield* makeDevCompilerBridgeEffect(
      () =>
        Effect.sync(() => {
          calls += 1;
        }).pipe(
          Effect.andThen(Deferred.succeed(entered, undefined)),
          Effect.andThen(Effect.never),
          Effect.ensuring(
            Deferred.succeed(releasing, undefined).pipe(Effect.andThen(Deferred.await(released))),
          ),
        ),
      scope,
    );
    const controller = new AbortController();
    const first = Promise.resolve(bridge.compile(request(controller))).catch(
      (error: unknown) => error,
    );
    yield* Deferred.await(entered);
    const second = Promise.resolve(bridge.compile(request(controller, 2))).catch(
      (error: unknown) => error,
    );
    bridge.close();
    const rejected = Promise.resolve(bridge.compile(request(controller, 3))).catch(
      (error: unknown) => error,
    );
    expect(yield* Effect.promise(() => rejected)).toEqual(
      new Error("Development compiler is closed."),
    );
    const closing = yield* Scope.close(scope, Exit.void).pipe(Effect.forkChild);
    yield* Deferred.await(releasing);
    expect(closing.pollUnsafe()).toBeUndefined();
    yield* Deferred.succeed(released, undefined);
    yield* Fiber.join(closing);
    expect(yield* Effect.promise(() => first)).toBeDefined();
    expect(yield* Effect.promise(() => second)).toEqual(
      new Error("Development compiler is closed."),
    );
    expect(calls).toBe(1);
  }),
);
