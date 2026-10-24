/** Validates the history domain's resource/IPC contracts through an explicit native test Layer. */
import { expect, it } from "@effect/vitest";
import { Cause, Effect, Exit, Layer } from "effect";
import type { LocalWorkerEffects } from "@relkit/observability/local/worker-contract";
import { LocalWorkerError } from "@relkit/observability/local/worker-contract";
import { InspectorHistory } from "../src/history.service.js";
import { InspectorHistoryNative } from "../src/history-native.service.js";

/** Captures one native writer lease; query calls never acquire another resource. */
function fixture(call: LocalWorkerEffects["call"]) {
  let acquired = 0;
  let released = 0;
  const worker: LocalWorkerEffects = { pid: undefined, call, close: () => Effect.void };
  return {
    counts: () => ({ acquired, released }),
    layer: Layer.succeed(InspectorHistoryNative, {
      acquire: () =>
        Effect.acquireRelease(
          Effect.sync(() => {
            acquired++;
            return worker;
          }),
          () =>
            Effect.sync(() => {
              released++;
            }),
        ),
    }),
  };
}

it.effect("rejects a malformed worker reply instead of exposing it as history", () => {
  const f = fixture(() => Effect.succeed({ protocol: "wrong", version: 1, items: [] }));
  return Effect.scoped(
    Effect.gen(function* () {
      const history = yield* InspectorHistory.make("/fixture", "project");
      const exit = yield* Effect.exit(history.call({ type: "query", kind: "logs", query: {} }));
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit))
        expect(Cause.squash(exit.cause)).toMatchObject({ operation: "history.invalid-reply" });
    }),
  ).pipe(Effect.provide(f.layer));
});

it.effect("preserves native worker failures and their original typed cause", () => {
  const primary = new LocalWorkerError({ reason: "worker", message: "native writer failed" });
  const f = fixture(() => Effect.fail(primary));
  return Effect.scoped(
    Effect.gen(function* () {
      const history = yield* InspectorHistory.make("/fixture", "project");
      const exit = yield* Effect.exit(history.call({ type: "flush" }));
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toHaveProperty("cause", primary);
    }),
  ).pipe(Effect.provide(f.layer));
});

it.effect("multiple methods borrow one native owner and scope release joins it once", () => {
  const f = fixture(() =>
    Effect.succeed({ protocol: "relkit.observability.query", version: 1, items: [] }),
  );
  return Effect.gen(function* () {
    yield* Effect.scoped(
      Effect.gen(function* () {
        const history = yield* InspectorHistory.make("/fixture", "project");
        yield* history.call({ type: "query", kind: "logs", query: {} });
        yield* history.call({ type: "query", kind: "requests", query: {} });
        expect(f.counts()).toEqual({ acquired: 1, released: 0 });
      }),
    );
    expect(f.counts()).toEqual({ acquired: 1, released: 1 });
  }).pipe(Effect.provide(f.layer));
});

it.effect(
  "native defects retain their channel instead of becoming retryable storage errors",
  () => {
    const defect = new Error("fixture defect");
    const f = fixture(() => Effect.die(defect));
    return Effect.scoped(
      Effect.gen(function* () {
        const history = yield* InspectorHistory.make("/fixture", "project");
        const exit = yield* Effect.exit(history.call({ type: "flush" }));
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBe(defect);
      }),
    ).pipe(Effect.provide(f.layer));
  },
);

it.effect("mixed native failure and defect evidence is preserved together", () => {
  const primary = new LocalWorkerError({ reason: "worker", message: "primary native failure" });
  const defect = new Error("secondary defect");
  const f = fixture(() => Effect.failCause(Cause.combine(Cause.fail(primary), Cause.die(defect))));
  return Effect.scoped(
    Effect.gen(function* () {
      const history = yield* InspectorHistory.make("/fixture", "project");
      const exit = yield* Effect.exit(history.call({ type: "flush" }));
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) expect(exit.cause.reasons).toHaveLength(2);
    }),
  ).pipe(Effect.provide(f.layer));
});
