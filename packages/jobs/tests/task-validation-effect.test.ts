import { expect, test } from "vitest";
import { z } from "@relkit/schema";
import { Effect, Layer, Result } from "effect";
import {
  assertSchemaEffect,
  copyErrorsEffect,
  copyStreamsEffect,
  normalizeRetryEffect,
  taskDurationEffect,
  TaskValidationFailure,
} from "../src/task-validation.ts";
import { JobsTelemetry } from "../src/jobs-observability.ts";
test("task validation Effect paths preserve typed errors and telemetry", () => {
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
  Effect.runSync(Effect.provide(assertSchemaEffect(z.string(), "input"), layer));
  expect(Effect.runSync(Effect.provide(copyErrorsEffect([]), layer))).toEqual([]);
  expect(
    Effect.runSync(Effect.provide(taskDurationEffect("1 second", "maxDuration", true), layer)),
  ).toBe("1 second");
  const invalidRetry = Effect.runSync(
    Effect.result(Effect.provide(normalizeRetryEffect({ maxAttempts: 0 }), layer)),
  );
  const invalidStream = Effect.runSync(
    Effect.result(Effect.provide(copyStreamsEffect({ "bad-name": z.string() }), layer)),
  );
  expect(Result.isFailure(invalidRetry)).toBe(true);
  expect(Result.isFailure(invalidStream)).toBe(true);
  if (Result.isFailure(invalidRetry))
    expect(invalidRetry.failure).toBeInstanceOf(TaskValidationFailure);
  expect(seen).toContain("taskValidation.assertSchema");
  expect(seen).toContain("taskValidation.retry");
  expect(seen).toContain("taskValidation.streams");
});
