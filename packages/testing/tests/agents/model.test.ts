import { expect, it } from "@effect/vitest";
import { Cause, Effect, Exit, Fiber, Layer } from "effect";
import { TestModelScript, modelScriptLayer, createTestModel } from "../../src/agents-model.js";

it.effect("a hanging native model turn consumes caller cancellation", () =>
  Effect.gen(function* () {
    const script = yield* TestModelScript;
    const controller = new AbortController();
    const sentinel = new Error("native abort");
    const fiber = yield* Effect.forkChild(
      script.turn({ messages: [], tools: [] }, controller.signal),
    );
    yield* Effect.yieldNow;
    controller.abort(sentinel);
    const result = yield* Effect.exit(Fiber.join(fiber));
    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) expect(Cause.squash(result.cause)).toBe(sentinel);
  }).pipe(Effect.provide(modelScriptLayer({ hang: true }))),
);

it.effect("runs the same model consumer with live and substituted script Layers", () =>
  Effect.gen(function* () {
    const consumer = Effect.gen(function* () {
      const script = yield* TestModelScript;
      yield* script.script([{ type: "final", output: { source: "live" } }]);
      return yield* script.turn({ messages: [], tools: [] });
    });
    const test = Layer.succeed(
      TestModelScript,
      TestModelScript.of({
        turn: () => Effect.succeed({ type: "final" as const, output: { source: "test" } }),
        script: () => Effect.void,
        reset: Effect.void,
        calls: Effect.succeed([]),
      }),
    );
    expect(yield* consumer.pipe(Effect.provide(modelScriptLayer()))).toEqual({
      type: "final",
      output: { source: "live" },
    });
    expect(yield* consumer.pipe(Effect.provide(test))).toEqual({
      type: "final",
      output: { source: "test" },
    });
  }),
);

it.effect("model reset settles hanging turns and script state is detached", () =>
  Effect.gen(function* () {
    const script = yield* TestModelScript;
    const fiber = yield* Effect.forkChild(script.turn({ messages: [], tools: [] }));
    yield* Effect.yieldNow;
    yield* script.reset;
    const result = yield* Effect.exit(Fiber.join(fiber));
    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) expect(String(Cause.squash(result.cause))).toContain("reset");
  }).pipe(Effect.provide(modelScriptLayer({ hang: true }))),
);

it.effect("public native LangChain generation settles when its model owner closes", () =>
  Effect.gen(function* () {
    const model = createTestModel({ hang: true });
    try {
      const pending = model.languageModel.invoke("owned native generation");
      const settled = Promise.allSettled([pending]);
      yield* Effect.yieldNow;
      yield* Effect.promise(() => model.close());
      const outcomes = yield* Effect.promise(() => settled);
      expect(outcomes[0]?.status).toBe("rejected");
      yield* Effect.promise(() => model.close());
    } finally {
      yield* Effect.promise(() => model.close());
    }
  }),
);
