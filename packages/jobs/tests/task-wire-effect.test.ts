import { expect, test } from "vitest";
import { z } from "@relkit/schema";
import { Effect, Layer, Result } from "effect";
import {
  decodeJobWireEffect,
  encodeTaskInputEffect,
  TaskWireFailure,
  validateCanonicalInputEffect,
  validateTaskOutputEffect,
} from "../src/task-wire.ts";
import { JobsTelemetry } from "../src/jobs-observability.ts";
test("Effect wire codec and validators expose typed failures and telemetry", async () => {
  const seen: string[] = [];
  const layer = Layer.succeed(
    JobsTelemetry,
    JobsTelemetry.of({
      observe: (operation, effect) => {
        seen.push(operation);
        return effect;
      },
    }),
  );
  const envelope = Effect.runSync(Effect.provide(encodeTaskInputEffect({ id: 1 }), layer));
  expect(Effect.runSync(Effect.provide(decodeJobWireEffect(envelope), layer))).toEqual({ id: 1 });
  const output = await Effect.runPromise(
    Effect.provide(validateTaskOutputEffect(z.string(), "done"), layer),
  );
  expect(output.wire).toMatchObject({ kind: "json", value: "done" });
  const invalid = await Effect.runPromise(
    Effect.result(
      Effect.provide(
        validateCanonicalInputEffect(
          z.number(),
          7,
          z.number().transform((value) => value + 1),
        ),
        layer,
      ),
    ),
  );
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) {
    expect(invalid.failure).toBeInstanceOf(TaskWireFailure);
    expect(invalid.failure.code).toBe("RELKIT_TASK_INPUT_WIRE_NON_IDENTITY");
  }
  expect(seen).toEqual([
    "taskWire.encodeInput",
    "taskWire.decodeJob",
    "taskWire.validateOutput",
    "taskWire.validateCanonicalInput",
  ]);
});
