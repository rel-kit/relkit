import { expect, test } from "vitest";
import { Context, Effect, Metric, Option, Tracer } from "effect";
import { assertToolDescriptorEffect, isToolRefEffect } from "../src/define-tool.js";
import { runToolPromise, runToolSync } from "../src/tool-observability.js";

test("live telemetry records bounded success and failure metrics", () => {
  const metric = (kind: "operations" | "failures" | "duration", operation: string) => {
    const name =
      kind === "operations"
        ? "relkit_tool_operations_total"
        : kind === "failures"
          ? "relkit_tool_failures_total"
          : "relkit_tool_duration_ms";
    const base =
      kind === "duration"
        ? Metric.histogram(name, { boundaries: [0.01, 0.1, 1, 5, 10, 50, 100] })
        : Metric.counter(name, { incremental: true });
    return Metric.withAttributes(base, { operation });
  };
  const counts = (operation: string) =>
    Effect.runSync(
      Effect.gen(function* () {
        return {
          calls: (yield* Metric.value(metric("operations", operation))).count,
          failures: (yield* Metric.value(metric("failures", operation))).count,
          duration: (yield* Metric.value(metric("duration", operation))).count,
        };
      }),
    );
  const beforeSuccess = counts("is-ref");
  const beforeFailure = counts("assert-descriptor");
  Effect.runSync(isToolRefEffect({ ref: { kind: "tool", id: "orders.lookup" } }));
  Effect.runSync(
    Effect.catchTag(assertToolDescriptorEffect({}), "ToolOperationFailure", () => Effect.void),
  );
  const afterSuccess = counts("is-ref");
  const afterFailure = counts("assert-descriptor");
  expect(afterSuccess.calls - beforeSuccess.calls).toBe(1);
  expect(afterSuccess.failures - beforeSuccess.failures).toBe(0);
  expect(afterSuccess.duration - beforeSuccess.duration).toBe(1);
  expect(afterFailure.calls - beforeFailure.calls).toBe(1);
  expect(afterFailure.failures - beforeFailure.failures).toBe(1);
  expect(afterFailure.duration - beforeFailure.duration).toBe(1);
});

test("live observer creates the stable tool span", () => {
  const names: string[] = [];
  const tracer = Tracer.make({
    span: (options) => {
      names.push(options.name);
      return new Tracer.NativeSpan(options);
    },
  });
  const hasParent = Effect.runSync(
    Effect.provide(
      Effect.gen(function* () {
        yield* isToolRefEffect({ ref: { kind: "tool", id: "orders.lookup" } });
        return Option.isSome(yield* Effect.serviceOption(Tracer.ParentSpan));
      }).pipe(Effect.withSpan("test.parent")),
      Context.make(Tracer.Tracer, tracer),
    ),
  );
  expect(hasParent).toBe(true);
  expect(names).toContain("tools.is-ref");
});

test("compatibility runners leave unrelated defects visible", async () => {
  const defect = new Error("unexpected defect");
  expect(() => runToolSync(Effect.die(defect))).toThrow(defect);
  await expect(runToolPromise(Effect.die(defect))).rejects.toBe(defect);
});
