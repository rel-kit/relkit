import { Effect, Layer, Result } from "effect";
import { expect, test } from "vitest";
import { JobsTelemetry } from "../src/jobs-observability.ts";
import {
  assertSupportedJobsServiceOptions,
  assertSupportedJobsServiceOptionsEffect,
  deserializeJobsServiceOptions,
  deserializeJobsServiceOptionsEffect,
  JobsServiceOptionsError,
  serializeJobsServiceOptions,
  serializeJobsServiceOptionsEffect,
  validateJobsServiceOptions,
  validateJobsServiceOptionsEffect,
} from "../src/service-options.ts";
test("Effect validates and serializes service options with sync compatibility", async () => {
  const options = { limits: { inputBytes: 100 } };
  await Effect.runPromise(validateJobsServiceOptionsEffect(options));
  expect(validateJobsServiceOptions(options)).toBeUndefined();
  const stored = await Effect.runPromise(
    serializeJobsServiceOptionsEffect(options, { provider: "x" }),
  );
  expect(stored).toEqual({ limits: options.limits, native: { provider: "x" } });
  expect(stored).toEqual(serializeJobsServiceOptions(options, { provider: "x" }));
  expect(await Effect.runPromise(deserializeJobsServiceOptionsEffect(stored))).toEqual(options);
  expect(deserializeJobsServiceOptions(stored)).toEqual(options);
});
test("invalid service options and unsupported names fail with typed errors", async () => {
  const invalid = { limits: { inputBytes: 0 } };
  const result = await Effect.runPromise(Effect.result(validateJobsServiceOptionsEffect(invalid)));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(JobsServiceOptionsError);
  expect(() => validateJobsServiceOptions(invalid)).toThrow(TypeError);
  const unsupported = await Effect.runPromise(
    Effect.result(assertSupportedJobsServiceOptionsEffect({ maxElapsed: "1 second" }, [])),
  );
  expect(Result.isFailure(unsupported)).toBe(true);
  expect(() => assertSupportedJobsServiceOptions({ maxElapsed: "1 second" }, [])).toThrow(
    "RELKIT_JOBS_SERVICE_OPTION_UNSUPPORTED:maxElapsed",
  );
  expect(() => deserializeJobsServiceOptions(null)).toThrow(TypeError);
});
test("service options operations use the injectable observer", async () => {
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
  await Effect.runPromise(Effect.provide(assertSupportedJobsServiceOptionsEffect({}, []), layer));
  expect(seen).toEqual(["serviceOptions.assertSupported"]);
});
