import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import {
  assertJobsCapability,
  assertJobsCapabilityEffect,
  JobsCapabilityError,
  JobsCapabilityFailure,
  validateJobsCapabilityReport,
  validateJobsCapabilityReportEffect,
} from "../src/capabilities.ts";
import { assertAdapterMethods, assertAdapterMethodsEffect } from "../src/adapter-methods.ts";
import type { JobsAdapterRuntime } from "../src/adapter.ts";
const report = { service: "test", features: { submission: true } };
test("Effect validates a capability report and checks supported features", async () => {
  const validated = await Effect.runPromise(validateJobsCapabilityReportEffect(report));
  expect(Object.isFrozen(validated)).toBe(true);
  expect(validated).toEqual(validateJobsCapabilityReport(report));
  await Effect.runPromise(assertJobsCapabilityEffect(validated, "submission"));
  expect(assertJobsCapability(validated, "submission")).toBeUndefined();
});
test("invalid reports and unavailable capabilities have typed Effect failures", async () => {
  const invalid = await Effect.runPromise(Effect.result(validateJobsCapabilityReportEffect(null)));
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) {
    expect(invalid.failure).toBeInstanceOf(JobsCapabilityFailure);
    expect(invalid.failure.capability).toBe("report");
  }
  expect(() => validateJobsCapabilityReport(null)).toThrow(JobsCapabilityError);
  const unsupported = await Effect.runPromise(
    Effect.result(assertJobsCapabilityEffect(report, "retry")),
  );
  expect(Result.isFailure(unsupported)).toBe(true);
  if (Result.isFailure(unsupported)) expect(unsupported.failure.capability).toBe("retry");
  expect(() => assertJobsCapability(report, "retry")).toThrow(JobsCapabilityError);
});
test("adapter method checks fail by missing method in Effect and sync adapters", async () => {
  const adapter = { capabilities: report } as JobsAdapterRuntime;
  const result = await Effect.runPromise(Effect.result(assertAdapterMethodsEffect(adapter)));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure.capability).toBe("submit");
  expect(() => assertAdapterMethods(adapter)).toThrow('Jobs adapter method "submit" is required');
});
test("detailed capability reports preserve frozen evidence and support levels", async () => {
  const validated = await Effect.runPromise(
    validateJobsCapabilityReportEffect({
      service: "test",
      provider: "native",
      adapterId: "adapter",
      protocolVersion: 1,
      features: { submission: false },
      capabilities: {
        submission: { support: "native", constraints: { max: 10 }, evidence: ["contract"] },
        schedules: { support: "adapter" },
        retry: { support: "unverified" },
      },
      limits: { maxPageSize: 100 },
    }),
  );
  expect(validated).toMatchObject({
    provider: "native",
    adapterId: "adapter",
    limits: { maxPageSize: 100 },
  });
  expect(Object.isFrozen(validated.capabilities?.submission?.evidence)).toBe(true);
  expect(Object.isFrozen(validated.capabilities?.submission?.constraints)).toBe(true);
  await Effect.runPromise(assertJobsCapabilityEffect(validated, "submission"));
  await Effect.runPromise(assertJobsCapabilityEffect(validated, "schedules"));
  const rejected = await Effect.runPromise(
    Effect.result(assertJobsCapabilityEffect(validated, "retry")),
  );
  expect(Result.isFailure(rejected)).toBe(true);
});
test.each([
  [{ service: " ", features: {} }, "report"],
  [{ service: "test", protocolVersion: 2, features: {} }, "protocol"],
  [{ service: "test", features: { submission: "yes" } }, "features"],
  [{ service: "test", features: {}, capabilities: [] }, "details"],
  [{ service: "test", features: {}, capabilities: { retry: { support: "maybe" } } }, "retry"],
  [
    {
      service: "test",
      features: {},
      capabilities: { retry: { support: "native", constraints: [] } },
    },
    "constraints",
  ],
  [
    {
      service: "test",
      features: {},
      capabilities: { retry: { support: "native", evidence: [42] } },
    },
    "evidence",
  ],
  [{ service: "test", features: {}, limits: [] }, "limits"],
  [{ service: "test", features: {}, limits: { maxPageSize: 0 } }, "maxPageSize"],
] as const)("rejects malformed capability report %j", async (candidate, message) => {
  const result = await Effect.runPromise(
    Effect.result(validateJobsCapabilityReportEffect(candidate)),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) {
    expect(result.failure).toBeInstanceOf(JobsCapabilityFailure);
    expect(result.failure.reason).toContain(message);
  }
  expect(() => validateJobsCapabilityReport(candidate)).toThrow(message);
});
