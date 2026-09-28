import { expect, test } from "vitest";
import { Effect, Layer, Metric, Result } from "effect";
import {
  JobNameValidationError,
  assertJobName,
  assertJobNameEffect,
  isJobNameEffect,
  normalizeJobName,
  validateJobNameEffect,
} from "../src/job-name.ts";
import { JobsTelemetry } from "../src/jobs-observability.ts";

test("validates names in Effect with a tagged failure", async () => {
  expect(await Effect.runPromise(isJobNameEffect("sendEmail"))).toBe(true);
  expect(await Effect.runPromise(isJobNameEffect("then"))).toBe(false);
  expect(await Effect.runPromise(validateJobNameEffect("sendEmail"))).toBe("sendEmail");
  const invalid = await Effect.runPromise(Effect.result(assertJobNameEffect("then", "job")));
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) {
    expect(invalid.failure).toBeInstanceOf(JobNameValidationError);
    expect(invalid.failure._tag).toBe("Jobs.JobNameValidationError");
    expect(invalid.failure.source).toBe("job");
  }
});

test("keeps synchronous assertions and aliases compatible", () => {
  expect(normalizeJobName("sendEmail")).toBe("sendEmail");
  expect(() => assertJobName("then", "job")).toThrow(TypeError);
  expect(() => assertJobName("then", "job")).toThrow("job must be");
});

test("records failure metrics and accepts an observer Layer", async () => {
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
  await Effect.runPromise(Effect.provide(validateJobNameEffect("sendEmail"), layer));
  expect(seen).toEqual(["jobName.validate", "jobName.assert", "jobName.is"]);

  const failures = Metric.counter("relkit_jobs_failures_total", { incremental: true });
  const count = Effect.runSync(
    Effect.provideService(
      Effect.gen(function* () {
        yield* Effect.result(assertJobNameEffect("then"));
        return (yield* Metric.value(
          Metric.withAttributes(failures, { operation: "jobName.assert" }),
        )).count;
      }),
      Metric.MetricRegistry,
      new Map(),
    ),
  );
  expect(count).toBe(1);
});
