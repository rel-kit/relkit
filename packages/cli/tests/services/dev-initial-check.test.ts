/**
 * Verifies the initial validation barrier before any session/support acquisition.
 * Injected capabilities preserve diagnostic/transport failure identity and join
 * interruption cleanup. Default inspector resolution follows packaged policy.
 */
import { expect, it } from "@effect/vitest";
import { Cause, Deferred, Effect, Exit, Fiber, Logger } from "effect";
import { cliAdapterError } from "../../src/cli-errors.js";
import { devCommandOperationEffect } from "../../src/commands/dev-command-operation.js";
import type { DevCheckRequest } from "../../src/commands/dev-check.types.js";
import {
  args,
  context,
  failed,
  initialCheckTestLayer as layer,
} from "./dev-initial-check.fixture.js";

it.effect(
  "initial development uses the substitute with fresh identity and preserves diagnostics",
  () =>
    Effect.gen(function* () {
      const requests: DevCheckRequest[] = [];
      let watchesClosed = 0;
      const graph = layer(
        (request) =>
          Effect.sync(() => {
            requests.push(request);
            return failed;
          }),
        () => {
          watchesClosed += 1;
        },
      );
      for (let attempt = 0; attempt < 2; attempt++) {
        const failure = yield* Effect.flip(
          Effect.scoped(devCommandOperationEffect(args, context)).pipe(
            Effect.provide(graph),
            Effect.provide(Logger.layer([])),
          ),
        );
        expect(failure._tag).toBe("CliFailureError");
        if (failure._tag === "CliFailureError") {
          expect(failure.code).toBe("RELKIT_DEV_COMPILE_FAILED");
          expect(failure.message).toContain("Initial check failed.");
        }
      }
      expect(requests).toHaveLength(2);
      expect(watchesClosed).toBe(2);
      expect(requests[0]?.projectRoot).toBe(context.args[1]);
      expect(requests[0]?.generationId).toMatch(/^dev-initial-/);
      expect(requests[1]?.generationId).not.toBe(requests[0]?.generationId);
    }),
);

it.effect(
  "initial worker transport failure retains its typed identity before session admission",
  () =>
    Effect.gen(function* () {
      const failure = cliAdapterError("dev.compiler.spawn", new Error("Cannot spawn compiler."));
      let watchesClosed = 0;
      const outcome = yield* Effect.flip(
        Effect.scoped(devCommandOperationEffect(args, context)).pipe(
          Effect.provide(
            layer(
              () => Effect.fail(failure),
              () => {
                watchesClosed += 1;
              },
            ),
          ),
          Effect.provide(Logger.layer([])),
        ),
      );
      expect(outcome).toBe(failure);
      expect(watchesClosed).toBe(1);
    }),
);

it.effect("interrupting the initial capability joins its release before admitting telemetry", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    const releasing = yield* Deferred.make<void>();
    const released = yield* Deferred.make<void>();
    let watchesClosed = 0;
    const graph = layer(
      () =>
        Deferred.succeed(entered, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.ensuring(
            Deferred.succeed(releasing, undefined).pipe(Effect.andThen(Deferred.await(released))),
          ),
        ),
      () => {
        watchesClosed += 1;
      },
    );
    const running = yield* Effect.scoped(devCommandOperationEffect(args, context)).pipe(
      Effect.provide(graph),
      Effect.provide(Logger.layer([])),
      Effect.forkChild,
    );
    yield* Deferred.await(entered);
    const interrupting = yield* Fiber.interrupt(running).pipe(Effect.forkChild);
    yield* Deferred.await(releasing);
    expect(interrupting.pollUnsafe()).toBeUndefined();
    yield* Deferred.succeed(released, undefined);
    yield* Fiber.join(interrupting);
    expect(watchesClosed).toBe(1);
    const outcome = yield* Fiber.await(running);
    expect(Exit.isFailure(outcome)).toBe(true);
    if (Exit.isFailure(outcome)) expect(Cause.hasInterruptsOnly(outcome.cause)).toBe(true);
  }),
);
