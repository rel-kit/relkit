import { assert, describe, it } from "@effect/vitest";
import { Context, Effect, Fiber, ManagedRuntime, Metric, References } from "effect";
import { inspectorLoggerLayer } from "../../src/execution.js";
import { graphSnapshotEffect } from "../../src/graph.js";
import {
  InspectorBoundaryError,
  nativeAttempt,
  runInspectorPromise,
} from "../../src/native-edge.js";
import { generation } from "../fixtures/services.js";
import type { RedactedLogRecord } from "@relkit/runtime-effect";

describe("Inspector owner observations", () => {
  it("isolates reused owner metrics and admits configured redacted logs", async () => {
    const records: RedactedLogRecord[] = [];
    const first = ManagedRuntime.make(
      inspectorLoggerLayer({ human: false, json: { write: (record) => records.push(record) } }),
    );
    const sibling = ManagedRuntime.make(inspectorLoggerLayer({ human: false, json: false }));
    try {
      const registry = await first.runPromise(Metric.MetricRegistry);
      const other = await sibling.runPromise(Metric.MetricRegistry);
      const active = generation({ graph: { nodes: [], edges: [] } });
      await runInspectorPromise(first, graphSnapshotEffect(active));
      await first.runPromise(
        Effect.logInfo("child log").pipe(
          Effect.annotateLogs({ password: "raw-owner-secret" }),
          Effect.forkChild,
          Effect.flatMap(Fiber.join),
        ),
      );
      const counter = [...registry.values()].find(
        (entry) => entry.id === "relkit_execution_operations_total",
      );
      assert.strictEqual(counter?.hooks.get(Context.empty()).count, 1);
      assert.strictEqual(other.size, 0);
      assert.notStrictEqual(registry, other);
      assert.notInclude(JSON.stringify(records), "raw-owner-secret");
      assert.isTrue(records.some((record) => record.message.includes("child log")));
      await runInspectorPromise(sibling, graphSnapshotEffect(active));
      assert.strictEqual(counter?.hooks.get(Context.empty()).count, 1);
      assert.isAbove(other.size, 0);
    } finally {
      try {
        await first.dispose();
      } finally {
        await sibling.dispose();
      }
    }
  });

  it("preserves native error identity at Promise compatibility edges", async () => {
    const owner = ManagedRuntime.make(inspectorLoggerLayer({ human: false, json: false }));
    try {
      const original = new Error("native failure");
      const failed = nativeAttempt(() => {
        throw original;
      });
      const result = await owner.runPromise(failed.pipe(Effect.flip));
      assert.instanceOf(result, InspectorBoundaryError);
      assert.strictEqual(result.cause, original);
      const caught = await runInspectorPromise(owner, failed).then(
        () => undefined,
        (error: unknown) => error,
      );
      assert.strictEqual(caught, original);
    } finally {
      await owner.dispose();
    }
  });

  it("keeps parent and sibling admission independent of a child override", async () => {
    const records: RedactedLogRecord[] = [];
    const owner = ManagedRuntime.make(
      inspectorLoggerLayer({
        minimumLevel: "error",
        human: false,
        json: { write: (record) => records.push(record) },
      }),
    );
    try {
      await owner.runPromise(
        Effect.gen(function* () {
          yield* Effect.logInfo("parent hidden");
          yield* Effect.logInfo("child admitted").pipe(
            Effect.provideService(References.MinimumLogLevel, "Info"),
            Effect.forkChild,
            Effect.flatMap(Fiber.join),
          );
          yield* Effect.logInfo("sibling hidden").pipe(
            Effect.forkChild,
            Effect.flatMap(Fiber.join),
          );
          yield* Effect.logError("parent admitted");
        }),
      );
      assert.deepStrictEqual(
        records.map((record) => record.message),
        ["child admitted", "parent admitted"],
      );
    } finally {
      await owner.dispose();
    }
  });
});
