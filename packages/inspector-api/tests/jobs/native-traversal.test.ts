import { assert, describe, it } from "@effect/vitest";
import { Effect, Fiber } from "effect";
import { InspectorNativeJobs, inspectorNativeJobsLayer } from "../../src/jobs/native.service.js";
import { aggregateRunsEffect } from "../../src/jobs/run-aggregate.js";
import { initialPosition } from "../../src/jobs/run-aggregate-support.js";
import { InspectorJobsError } from "../../src/jobs/types.js";
import { nativeAttempt } from "../../src/native-edge.js";
import { emptyPage, generation, jobBinding, nativeGate } from "../fixtures/services.js";
import type { JsonValue } from "@relkit/contracts";
import { isRecord } from "../../src/shared.js";

describe("Inspector finite native reads", () => {
  it.effect("bounds independent reads and returns declaration order", () =>
    Effect.gen(function* () {
      const native = yield* InspectorNativeJobs;
      const gates = [nativeGate<JsonValue>(), nativeGate<JsonValue>(), nativeGate<JsonValue>()];
      const firstTwo = nativeGate<void>();
      const third = nativeGate<void>();
      let active = 0;
      let started = 0;
      let peak = 0;
      const bindings = gates.map((gate, index) => ({
        ...jobBinding(String(index)),
        health: () => {
          active++;
          started++;
          peak = Math.max(peak, active);
          if (started === 2) firstTwo.resolve();
          if (started === 3) third.resolve();
          return gate.promise.finally(() => {
            active--;
          });
        },
      }));
      const read = yield* Effect.forkChild(native.healthPages(bindings, 2));
      yield* nativeAttempt(() => firstTwo.promise);
      assert.strictEqual(started, 2);
      assert.strictEqual(active, 2);
      gates[1]!.resolve("second");
      yield* nativeAttempt(() => third.promise);
      gates[2]!.resolve("third");
      gates[0]!.resolve("first");
      const result = yield* Fiber.join(read);
      assert.deepStrictEqual(
        result.map((entry) => entry.health),
        ["first", "second", "third"],
      );
      assert.strictEqual(peak, 2);
      assert.strictEqual(active, 0);
    }).pipe(Effect.provide(inspectorNativeJobsLayer)),
  );

  it.effect("keeps unavailable services partial and suppresses exact aggregate counts", () =>
    Effect.gen(function* () {
      const bindings = [
        jobBinding("healthy", () => ({ ...emptyPage(), count: { value: 0, accuracy: "exact" } })),
        jobBinding("down", () => {
          throw new Error("unavailable");
        }),
      ];
      const active = generation({ jobs: { bindings } });
      const result = yield* aggregateRunsEffect(
        active,
        new Request("http://localhost"),
        { limit: 1 },
        null,
      );
      assert.isObject(result);
      if (!isRecord(result)) throw new Error("missing aggregate response");
      assert.strictEqual(result.partial, true);
      assert.isUndefined(result.count);
      assert.deepStrictEqual(result.availability, [
        { service: "healthy", state: "available" },
        { service: "down", state: "unavailable", reason: "native service unavailable" },
      ]);
    }).pipe(Effect.provide(inspectorNativeJobsLayer)),
  );

  it.effect("fails fatally on a nonadvancing native cursor and preserves request signals", () =>
    Effect.gen(function* () {
      const native = yield* InspectorNativeJobs;
      const abort = new AbortController();
      const request = new Request("http://localhost", { signal: abort.signal });
      let passed: AbortSignal | undefined;
      const binding = jobBinding("native", (_query, context) => {
        passed = context.signal;
        return { ...emptyPage(), hasMore: true, nextCursor: "same" };
      });
      const active = generation({ jobs: { bindings: [binding] } });
      const position = {
        services: [{ ...initialPosition([binding]).services[0]!, cursor: "same" }],
      };
      const failure = yield* native
        .runPages(active, request, {}, [binding], position)
        .pipe(Effect.flip);
      assert.instanceOf(failure, InspectorJobsError);
      assert.strictEqual(failure.code, "RELKIT_INSPECTOR_JOBS_CURSOR_INVALID");
      assert.strictEqual(passed, request.signal);
    }).pipe(Effect.provide(inspectorNativeJobsLayer)),
  );
});
