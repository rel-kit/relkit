import { assert, describe, it } from "@effect/vitest";
import { Effect, Fiber, Layer, ManagedRuntime } from "effect";
import { InspectorControls, inspectorControlsLayer } from "../../src/controls.service.js";
import { InspectorActionError } from "../../src/actions-errors.js";
import type { InspectorActionResult } from "../../src/actions-runtime.types.js";
import {
  nativeAttempt,
  runInspectorPromise,
  unwrapInspectorFailure,
} from "../../src/native-edge.js";
import { inspectorLoggerLayer } from "../../src/execution.js";
import { actionRequest, generation, nativeGate } from "../fixtures/services.js";

describe("Inspector authoritative receipts", () => {
  it.effect("distinguishes sensitive inputs while preserving canonical property order", () =>
    Effect.gen(function* () {
      const controls = yield* InspectorControls;
      let calls = 0;
      const active = generation({
        actions: {
          functions: {
            invoke: () => {
              calls++;
              return null;
            },
          },
        },
      });
      const options = { mode: "test" as const, getGeneration: async () => active };
      const first = yield* controls.execute(
        actionRequest({ input: { password: "one", order: 1 } }),
        options,
      );
      const reordered = yield* controls.execute(
        actionRequest({ input: { order: 1, password: "one" } }),
        options,
      );
      assert.strictEqual(reordered, first);
      const conflict = yield* controls
        .execute(actionRequest({ input: { password: "two", order: 1 } }), options)
        .pipe(Effect.flip);
      assert.instanceOf(conflict, InspectorActionError);
      assert.strictEqual(
        (conflict as InspectorActionError).code,
        "RELKIT_INSPECTOR_IDEMPOTENCY_CONFLICT",
      );
      assert.strictEqual(calls, 1);
    }).pipe(Effect.provide(inspectorControlsLayer)),
  );

  it.effect("rejects accessor-backed fingerprint input without invoking it", () =>
    Effect.gen(function* () {
      const controls = yield* InspectorControls;
      let reads = 0;
      let calls = 0;
      const body = Object.defineProperty({}, "input", {
        enumerable: true,
        get: () => {
          reads++;
          throw new Error("private input");
        },
      });
      const active = generation({
        actions: {
          functions: {
            invoke: () => {
              calls++;
              return null;
            },
          },
        },
      });
      const failure = yield* controls
        .execute(actionRequest(body), { mode: "test", getGeneration: async () => active })
        .pipe(Effect.flip);
      assert.instanceOf(failure, InspectorActionError);
      assert.strictEqual(reads, 0);
      assert.strictEqual(calls, 0);
    }).pipe(Effect.provide(inspectorControlsLayer)),
  );
  it("settles retained receipts when the owning router layer is disposed", async () => {
    const owner = ManagedRuntime.make(
      Layer.mergeAll(inspectorControlsLayer, inspectorLoggerLayer({ human: false, json: false })),
    );
    const started = nativeGate<void>();
    const completion = nativeGate<unknown>();
    const active = generation({
      actions: {
        functions: {
          invoke: () => {
            started.resolve();
            return completion.promise;
          },
        },
      },
    });
    const idempotency = new Map<string, Promise<InspectorActionResult>>();
    const waiting = runInspectorPromise(
      owner,
      Effect.flatMap(InspectorControls, (controls) =>
        controls.execute(actionRequest(), {
          mode: "test",
          getGeneration: async () => active,
          idempotency,
        }),
      ),
    );
    const settled = waiting.then(
      () => "success",
      () => "interrupted",
    );
    try {
      await started.promise;
      await owner.dispose();
      assert.strictEqual(await settled, "interrupted");
      assert.strictEqual(
        await [...idempotency.values()][0]!.then(
          () => "success",
          () => "interrupted",
        ),
        "interrupted",
      );
      assert.strictEqual(idempotency.size, 1);
    } finally {
      completion.resolve(null);
      await owner.dispose();
    }
  });
  it.effect("owns one dispatch after the first waiter is interrupted", () =>
    Effect.gen(function* () {
      const controls = yield* InspectorControls;
      const started = nativeGate<void>();
      const completion = nativeGate<unknown>();
      let calls = 0;
      const active = generation({
        actions: {
          functions: {
            invoke: () => {
              calls++;
              started.resolve();
              return completion.promise;
            },
          },
        },
      });
      const idempotency = new Map<string, Promise<InspectorActionResult>>();
      const options = { mode: "test" as const, getGeneration: async () => active, idempotency };
      const first = yield* Effect.forkChild(controls.execute(actionRequest(), options));
      yield* nativeAttempt(() => started.promise);
      yield* Fiber.interrupt(first);
      const second = yield* Effect.forkChild(controls.execute(actionRequest(), options));
      completion.resolve({ ok: true });
      const receipt = yield* Fiber.join(second);
      assert.strictEqual(calls, 1);
      assert.strictEqual(idempotency.size, 1);
      assert.strictEqual(yield* nativeAttempt(() => [...idempotency.values()][0]!), receipt);
      assert.strictEqual(receipt.status, 200);
      const conflict = yield* controls
        .execute(actionRequest({ input: { order: 2 } }), options)
        .pipe(Effect.flip);
      assert.instanceOf(unwrapInspectorFailure(conflict), InspectorActionError);
      assert.strictEqual(
        (unwrapInspectorFailure(conflict) as InspectorActionError).code,
        "RELKIT_INSPECTOR_IDEMPOTENCY_CONFLICT",
      );
    }).pipe(Effect.provide(inspectorControlsLayer)),
  );

  it.effect("retains failed dispatches and consumes preexisting Promise receipts", () =>
    Effect.gen(function* () {
      const controls = yield* InspectorControls;
      let calls = 0;
      const active = generation({
        actions: {
          functions: {
            invoke: () => {
              calls++;
              throw new Error("provider failed");
            },
          },
        },
      });
      const idempotency = new Map<string, Promise<InspectorActionResult>>();
      const options = { mode: "test" as const, getGeneration: async () => active, idempotency };
      const first = yield* controls.execute(actionRequest(), options).pipe(Effect.flip);
      const second = yield* controls
        .execute(actionRequest({ input: "changed" }), options)
        .pipe(Effect.flip);
      assert.strictEqual(unwrapInspectorFailure(second), first);
      assert.strictEqual(calls, 1);
      assert.strictEqual(idempotency.size, 1);
    }).pipe(Effect.provide(inspectorControlsLayer)),
  );

  it.effect("validates the active generation before consulting retained receipts", () =>
    Effect.gen(function* () {
      const controls = yield* InspectorControls;
      let calls = 0;
      const active = generation({
        actions: {
          functions: {
            invoke: () => {
              calls++;
              return null;
            },
          },
        },
      });
      const request = { ...actionRequest(), graphHash: "stale" };
      const failure = yield* controls
        .execute(request, { mode: "test", getGeneration: async () => active })
        .pipe(Effect.flip);
      assert.instanceOf(failure, InspectorActionError);
      assert.strictEqual(
        (failure as InspectorActionError).code,
        "RELKIT_INSPECTOR_GENERATION_NOT_ACTIVE",
      );
      assert.strictEqual(calls, 0);
    }).pipe(Effect.provide(inspectorControlsLayer)),
  );

  it.effect("uses the same control contract in a deterministic test layer", () =>
    Effect.gen(function* () {
      const controls = yield* InspectorControls;
      const receipt = yield* controls.execute(actionRequest(), {
        mode: "test",
        getGeneration: async () => generation(),
      });
      assert.strictEqual(receipt.body.fixture, true);
    }).pipe(
      Effect.provide(
        Layer.succeed(
          InspectorControls,
          InspectorControls.of({
            execute: () =>
              Effect.succeed({ status: 200, fingerprint: "test", body: { fixture: true } }),
          }),
        ),
      ),
    ),
  );
});
