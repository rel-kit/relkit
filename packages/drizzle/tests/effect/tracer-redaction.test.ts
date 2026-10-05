import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Cause, Deferred, Effect, Exit, Fiber, Tracer } from "effect";
import { DrizzleFailure } from "../../src/failure.js";
import { DrizzleOwner } from "../../src/owner.js";
import { observeSpecializedOperation } from "../../src/operation-tracing.js";
import { testOwnerLayer } from "./fixtures.js";

it.effect("configured tracers receive redacted exits for named workflows and all outcomes", () =>
  Effect.gen(function* () {
    const spans: Tracer.NativeSpan[] = [];
    const tracer = Tracer.make({
      span(options) {
        const span = new Tracer.NativeSpan(options);
        spans.push(span);
        return span;
      },
    });
    const secret = "native-secret-cookie-token-query";
    const failure = new Error(secret);
    const ready = yield* Deferred.make<void>();
    yield* Effect.gen(function* () {
      const owner = yield* DrizzleOwner;
      const named = Effect.fn("SDK.named")(() =>
        Effect.fail(new DrizzleFailure({ operation: "query", cause: failure })),
      );
      const failed = yield* Effect.exit(
        owner.work(observeSpecializedOperation("database.findOne", named())),
      );
      expect(Exit.isFailure(failed) && Cause.squash(failed.cause)).toBeInstanceOf(DrizzleFailure);
      expect(Exit.isFailure(failed) && (Cause.squash(failed.cause) as DrizzleFailure).cause).toBe(
        failure,
      );
      const died = yield* Effect.exit(
        owner.work(observeSpecializedOperation("database.update", Effect.die(failure))),
      );
      expect(Exit.isFailure(died) && Cause.squash(died.cause)).toBe(failure);
      expect(
        yield* owner.work(
          observeSpecializedOperation("database.findMany", Effect.succeed({ token: secret })),
        ),
      ).toEqual({ token: secret });
      const interrupted = yield* Effect.forkChild(
        owner.work(
          observeSpecializedOperation(
            "auth.api",
            Effect.andThen(Deferred.succeed(ready, undefined), Effect.never),
          ),
        ),
      );
      yield* Deferred.await(ready);
      yield* Fiber.interrupt(interrupted);
    }).pipe(Effect.provide(testOwnerLayer), Effect.provideService(Tracer.Tracer, tracer));
    const diagnostics: unknown[] = [];
    const categories = new Set<string>();
    for (const span of spans) {
      if (span.status._tag !== "Ended") continue;
      const exit = span.status.exit;
      if (Exit.isSuccess(exit)) {
        // Service layer construction is outside the specialized operation edge.
        if (span.name !== "Drizzle.owner") expect(exit.value).toBeUndefined();
      } else {
        for (const reason of exit.cause.reasons) categories.add(reason._tag);
        diagnostics.push(
          Cause.prettyErrors(exit.cause, { includeCauseInStack: true }).map((error) => ({
            message: error.message,
            stack: error.stack,
          })),
        );
      }
    }
    expect(categories).toEqual(new Set(["Fail", "Die", "Interrupt"]));
    expect(spans.map((span) => span.name)).toEqual(
      expect.arrayContaining(["Drizzle.admit", "SDK.named", "relkit.database.findOne"]),
    );
    expect(JSON.stringify(diagnostics)).not.toContain(secret);
  }),
);
