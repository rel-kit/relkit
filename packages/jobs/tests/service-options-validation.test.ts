import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import {
  JobsServiceOptionsError,
  validateJobsServiceOptions,
  validateJobsServiceOptionsEffect,
} from "../src/service-options-validation.ts";
import type { JobsServiceOptions } from "../src/service-options.types.ts";
const valid: JobsServiceOptions = {
  limits: {
    inputBytes: 1,
    outputBytes: 1,
    progressItemBytes: 1,
    streamItemBytes: 1,
  },
  maxElapsed: "1 second",
  hookTimeout: "1 second",
  shutdownGrace: "1 second",
  observation: { pollInterval: "2 seconds", readTimeout: "10 seconds" },
  workers: { classes: [{ id: "worker", cpu: 0.5, memory: "1 MiB", nativeClass: "small" }] },
};
test("validates every service option family through Effect and the sync API", async () => {
  await Effect.runPromise(validateJobsServiceOptionsEffect(undefined));
  await Effect.runPromise(validateJobsServiceOptionsEffect(valid));
  expect(validateJobsServiceOptions(valid)).toBeUndefined();
});
test.each([
  [{ limits: { inputBytes: 0 } }, "limits.inputBytes"],
  [{ limits: { outputBytes: 0 } }, "limits.outputBytes"],
  [{ limits: { progressItemBytes: 0 } }, "limits.progressItemBytes"],
  [{ limits: { streamItemBytes: 0 } }, "limits.streamItemBytes"],
  [{ maxElapsed: "0 seconds" }, "maxElapsed"],
  [{ observation: { pollInterval: "1 second" } }, "observation.pollInterval"],
  [{ observation: { readTimeout: "11 seconds" } }, "observation.readTimeout"],
  [{ workers: { classes: [{ id: "bad id", cpu: 1, memory: "1 MiB" }] } }, "ids"],
  [{ workers: { classes: [{ id: "worker", cpu: 0, memory: "1 MiB" }] } }, "cpu"],
  [{ workers: { classes: [{ id: "worker", cpu: 1, memory: "0.1 MiB" }] } }, "Memory"],
  [
    { workers: { classes: [{ id: "worker", cpu: 1, memory: "1 MiB", nativeClass: "bad id" }] } },
    "nativeClass",
  ],
] as const)("rejects invalid service option %j", async (options, message) => {
  const result = await Effect.runPromise(
    Effect.result(validateJobsServiceOptionsEffect(options as JobsServiceOptions)),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) {
    expect(result.failure).toBeInstanceOf(JobsServiceOptionsError);
    expect(result.failure.reason).toContain(message);
  }
  expect(() => validateJobsServiceOptions(options as JobsServiceOptions)).toThrow(message);
});
test("rejects duplicate worker classes", () => {
  expect(() =>
    validateJobsServiceOptions({
      workers: {
        classes: [
          { id: "worker", cpu: 1, memory: "1 MiB" },
          { id: "worker", cpu: 1, memory: "1 MiB" },
        ],
      },
    }),
  ).toThrow("unique stable ids");
});
