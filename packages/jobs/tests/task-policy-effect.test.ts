import { expect, test } from "vitest";
import { Effect, Layer, Result } from "effect";
import {
  assertFieldNameEffect,
  copyResourcesEffect,
  memoryBytesEffect,
  retryDelayMillisEffect,
  taskPolicyRandomLayer,
} from "../src/task-policy-validation.ts";
import { TaskValidationFailure } from "../src/task-validation.ts";
import { normalizeRetry } from "../src/task-validation.ts";
import { JobsTelemetry } from "../src/jobs-observability.ts";
test("task policy Effect operations validate values and inject retry randomness", () => {
  const seen: string[] = [];
  const telemetry = Layer.succeed(
    JobsTelemetry,
    JobsTelemetry.of({
      observe: (operation, effect) => {
        seen.push(operation);
        return effect;
      },
    }),
  );
  expect(Effect.runSync(Effect.provide(memoryBytesEffect("1 GiB"), telemetry))).toBe(1_073_741_824);
  expect(
    Effect.runSync(Effect.provide(copyResourcesEffect({ cpu: 1, memory: "1 GiB" }), telemetry)),
  ).toEqual({ cpu: 1, memory: "1 GiB" });
  const invalid = Effect.runSync(
    Effect.result(Effect.provide(assertFieldNameEffect("nested.path"), telemetry)),
  );
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) expect(invalid.failure).toBeInstanceOf(TaskValidationFailure);
  const policy = normalizeRetry({
    initialDelay: "1 second",
    maxDelay: "4 seconds",
    jitter: "full",
  });
  const layer = Layer.mergeAll(
    telemetry,
    taskPolicyRandomLayer(() => 0),
  );
  expect(Effect.runSync(Effect.provide(retryDelayMillisEffect(policy, 2), layer))).toBe(0);
  expect(seen).toContain("taskPolicy.retryDelay");
});
