/**
 * Checks complete failure translation at the shared CLI composition boundary.
 * Success and service requirements remain unchanged; mixed failures retain every
 * defect, interruption, and annotation rather than selecting the first error.
 */
import { expect, expectTypeOf, it } from "@effect/vitest";
import { Cause, Context, Effect, Exit } from "effect";
import { mapErrorCause } from "../../src/services/map-error-cause.js";

class RequestValue extends Context.Service<RequestValue, string>()("CauseTest.Request") {}

it.effect("preserves success and exact request requirements", () =>
  Effect.gen(function* () {
    const program = Effect.service(RequestValue).pipe(mapErrorCause((error: never) => error));
    expectTypeOf(program).toEqualTypeOf<Effect.Effect<string, never, RequestValue>>();
    expect(yield* program.pipe(Effect.provideService(RequestValue, "current"))).toBe("current");
  }),
);

it.effect("translates every failure while retaining mixed siblings and annotations", () =>
  Effect.gen(function* () {
    const defect = new Error("unrecoverable");
    const annotation = Context.make(RequestValue, "original");
    const cause = Cause.combine(
      Cause.annotate(Cause.combine(Cause.fail("one"), Cause.fail("two")), annotation),
      Cause.combine(Cause.die(defect), Cause.interrupt(42)),
    );
    const translated: string[] = [];
    const exit = yield* Effect.exit(
      Effect.failCause(cause).pipe(
        mapErrorCause((error) => {
          translated.push(error);
          return error.toUpperCase();
        }),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (!Exit.isFailure(exit)) return;
    expect(translated).toEqual(["one", "two"]);
    expect(exit.cause.reasons.map((reason) => reason._tag)).toEqual([
      "Fail",
      "Fail",
      "Die",
      "Interrupt",
    ]);
    expect(exit.cause.reasons[2]).toBe(cause.reasons[2]);
    expect(exit.cause.reasons[3]).toBe(cause.reasons[3]);
    const first = exit.cause.reasons[0];
    if (first === undefined) return yield* Effect.die(new Error("Missing translated reason"));
    expect(Context.getOrUndefined(Cause.reasonAnnotations(first), RequestValue)).toBe("original");
  }),
);

it.effect("never invokes translation for pure defects or interruption", () =>
  Effect.gen(function* () {
    const causes = [Cause.die(new Error("defect")), Cause.interrupt(9)];
    for (const cause of causes) {
      const exit = yield* Effect.exit(
        Effect.failCause(cause).pipe(
          mapErrorCause((_error: never) => {
            throw new Error("No typed failure exists");
          }),
        ),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) expect(exit.cause.reasons[0]).toBe(cause.reasons[0]);
    }
  }),
);
