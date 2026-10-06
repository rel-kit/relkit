import { Deferred, Effect, Exit, Ref, Scope } from "effect";
import { cleanupEffect, CliCleanup } from "../services/cleanup.service.js";
import { observeCli } from "../cli-runtime.js";

/**
 * Creates one child lifetime whose repeated closes join the same release receipt.
 * @returns Scope, registration helper and idempotent close owned by the parent.
 * @remarks Consumers close before queue flush and listener/worker retirement.
 */
export const telemetryLifetimeEffect = Effect.fn("DevTelemetry.lifetime")(function* () {
  const parent = yield* Scope.Scope;
  const cleanup = yield* CliCleanup;
  const scope = yield* Scope.fork(parent, "sequential");
  const closing = yield* Ref.make(false);
  const closed = yield* Deferred.make<void>();
  const streamClose = yield* Ref.make<() => void>(() => undefined);
  const close = observeCli(
    "dev.telemetry.close",
    Effect.uninterruptible(
      Effect.gen(function* () {
        const first = yield* Ref.modify(closing, (value) => [!value, true]);
        if (!first) return yield* Deferred.await(closed);
        yield* cleanupEffect(
          "dev.telemetry.stream-close",
          Effect.sync(() => Ref.getUnsafe(streamClose)()),
        ).pipe(Effect.provideService(CliCleanup, cleanup));
        yield* Scope.close(scope, Exit.void).pipe(
          Effect.ensuring(Deferred.succeed(closed, undefined)),
        );
      }),
    ),
  );
  yield* Scope.addFinalizer(parent, close);
  return {
    scope,
    streamClose,
    close,
    register: <E>(label: string, release: Effect.Effect<unknown, E>) =>
      Scope.addFinalizer(
        scope,
        cleanupEffect(label, release).pipe(Effect.provideService(CliCleanup, cleanup)),
      ),
  };
});
