import { expect, it } from "@effect/vitest";
import { DrizzleFailure } from "@relkit/drizzle/internal";
import { Cause, Effect, Layer, ManagedRuntime } from "effect";
import { runAuthPromise } from "../../src/activation.js";
import { AuthFailure } from "../../src/auth.errors.js";

it.effect("keeps lone native auth, database and defect rejection identities", () =>
  Effect.gen(function* () {
    const owner = yield* Effect.acquireRelease(
      Effect.sync(() => ManagedRuntime.make(Layer.empty)),
      (runtime) => Effect.promise(() => runtime.dispose()),
    );
    const native = new TypeError("native auth rejection");
    yield* Effect.promise(async () => {
      await expect(
        runAuthPromise(
          owner,
          Effect.fail(new AuthFailure({ operation: "auth.api", cause: native })),
        ),
      ).rejects.toBe(native);
      await expect(
        runAuthPromise(
          owner,
          Effect.fail(new DrizzleFailure({ operation: "admission", cause: native })),
        ),
      ).rejects.toBe(native);
      await expect(runAuthPromise(owner, Effect.die(native))).rejects.toBe(native);
    });
  }).pipe(Effect.scoped),
);

it.effect("retains both primary auth rejection and finalizer defect at the Promise edge", () =>
  Effect.gen(function* () {
    const owner = yield* Effect.acquireRelease(
      Effect.sync(() => ManagedRuntime.make(Layer.empty)),
      (runtime) => Effect.promise(() => runtime.dispose()),
    );
    const primary = new TypeError("native auth failure");
    const cleanup = new Error("native cleanup defect");
    const operation = Effect.fail(new AuthFailure({ operation: "auth.api", cause: primary })).pipe(
      Effect.ensuring(Effect.die(cleanup)),
    );
    const rejection = yield* Effect.promise(() =>
      runAuthPromise(owner, operation).then(
        () => undefined,
        (error: unknown) => error,
      ),
    );
    expect(rejection).toBeInstanceOf(AggregateError);
    if (!(rejection instanceof AggregateError)) throw new Error("Expected aggregate diagnostics");
    expect(rejection.errors).toEqual([primary, cleanup]);
    expect(Cause.isCause(rejection.cause)).toBe(true);
    if (!Cause.isCause(rejection.cause)) throw new Error("Expected preserved Effect cause");
    expect(Cause.hasFails(rejection.cause)).toBe(true);
    expect(Cause.hasDies(rejection.cause)).toBe(true);
  }).pipe(Effect.scoped),
);

it.effect("preserves interruption together with primary failure and cleanup defect", () =>
  Effect.gen(function* () {
    const owner = yield* Effect.acquireRelease(
      Effect.sync(() => ManagedRuntime.make(Layer.empty)),
      (runtime) => Effect.promise(() => runtime.dispose()),
    );
    const primary = new TypeError("native auth failure");
    const cleanup = new Error("native cleanup defect");
    const combined = Cause.combine(
      Cause.fail(new AuthFailure({ operation: "auth.api", cause: primary })),
      Cause.interrupt(42),
    );
    const operation = Effect.failCause(combined).pipe(Effect.ensuring(Effect.die(cleanup)));
    const rejection = yield* Effect.promise(() =>
      runAuthPromise(owner, operation).then(
        () => undefined,
        (error: unknown) => error,
      ),
    );
    expect(rejection).toBeInstanceOf(AggregateError);
    if (!(rejection instanceof AggregateError)) throw new Error("Expected aggregate diagnostics");
    expect(rejection.errors).toHaveLength(3);
    expect(rejection.errors).toContain(primary);
    expect(rejection.errors).toContain(cleanup);
    expect(
      rejection.errors.some(
        (error) => error instanceof Error && error.message.includes("interrupted"),
      ),
    ).toBe(true);
    if (!Cause.isCause(rejection.cause)) throw new Error("Expected preserved Effect cause");
    expect(Cause.hasFails(rejection.cause)).toBe(true);
    expect(Cause.hasDies(rejection.cause)).toBe(true);
    expect(Cause.hasInterrupts(rejection.cause)).toBe(true);
  }).pipe(Effect.scoped),
);
