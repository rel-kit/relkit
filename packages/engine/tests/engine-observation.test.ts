import { expect, it } from "@effect/vitest";
import type { InvocationRunner } from "@relkit/invocation";
import { createLoggerLayer, type LogRecord } from "@relkit/runtime-effect";
import { z } from "@relkit/schema";
import { Effect, Metric, References } from "effect";
import { vi } from "vitest";
import { enginePromise, runEnginePromise } from "../src/engine-runtime.js";
import { invoke, invokeEffect } from "../src/invoke.js";
import { makeGeneration } from "../src/lifecycle.js";

it("keeps unconfigured Promise callers quiet", async () => {
  const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
  try {
    await invoke({
      target: {
        id: "quiet.echo",
        input: z.number(),
        output: z.number(),
        handler: (value) => value,
      },
      input: 2,
    });
    await invoke({
      target: {
        id: "quiet.runner",
        input: z.number(),
        output: z.number(),
        handler: (value) => value,
      },
      input: 3,
      effectRunner: { run: (effect, options) => Effect.runPromise(effect, options) },
    });
    expect(output).not.toHaveBeenCalled();
  } finally {
    output.mockRestore();
  }
});

it.effect("retains configured logging and isolated metrics across native callbacks", () =>
  Effect.gen(function* () {
    const records: LogRecord[] = [];
    const layer = createLoggerLayer({
      human: {
        write: (_line, record) => {
          records.push(record);
        },
      },
      json: false,
      minimumLevel: "info",
    });
    yield* Effect.gen(function* () {
      const operation = makeGeneration().pipe(
        Effect.flatMap((generation) => generation.markReady()),
      );
      const count = Metric.withAttributes(
        Metric.counter("relkit_execution_operations_total", { incremental: true }),
        { domain: "engine", operation: "generation.markReady" },
      );
      expect((yield* Metric.value(count)).count).toBe(0);
      yield* enginePromise(() => runEnginePromise(operation));
      expect((yield* Metric.value(count)).count).toBe(1);
      yield* enginePromise(() => runEnginePromise(operation)).pipe(
        Effect.provideService(References.MinimumLogLevel, "Error"),
      );
      expect((yield* Metric.value(count)).count).toBe(2);
    }).pipe(Effect.provide(layer), Effect.provideService(Metric.MetricRegistry, new Map()));
    expect(records.map((record) => record.fields.operation)).toEqual(["generation.markReady"]);
    expect(records[0]?.fields.outcome).toBe("success");
  }),
);

it("uses the existing invocation runner for engine diagnostics", async () => {
  const records: LogRecord[] = [];
  const layer = createLoggerLayer({
    human: {
      write: (_line, record) => {
        records.push(record);
      },
    },
    json: false,
  });
  const runner: InvocationRunner = {
    run: (effect, options) => Effect.runPromise(effect.pipe(Effect.provide(layer)), options),
  };
  expect(
    await invoke({
      target: { id: "echo", input: z.number(), output: z.number(), handler: (input) => input },
      input: 4,
      effectRunner: runner,
    }),
  ).toBe(4);
  expect(records.some((record) => record.fields.operation === "startInvocation")).toBe(true);
  expect(records.every((record) => record.fields.outcome !== "failure")).toBe(true);
});

it.effect("does not classify native suspension as a terminal operation failure", () =>
  Effect.gen(function* () {
    const records: LogRecord[] = [];
    const marker = { resume: "later" };
    const result = yield* invokeEffect({
      target: {
        id: "suspend",
        input: z.unknown(),
        output: z.unknown(),
        handler: () => {
          throw marker;
        },
      },
      input: null,
      isSuspension: (cause) => cause === marker,
    }).pipe(
      Effect.result,
      Effect.provide(
        createLoggerLayer({
          human: {
            write: (_line, record) => {
              records.push(record);
            },
          },
          json: false,
        }),
      ),
    );
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") expect(result.failure).toBe(marker);
    expect(
      records.filter(
        (record) => record.fields.outcome === "failure" || record.fields.outcome === "defect",
      ),
    ).toEqual([]);
  }),
);
