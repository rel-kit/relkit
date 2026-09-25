import { expect, test } from "vitest";
import { Effect, Metric } from "effect";
import { captureRedacted, createRedactionPolicy, redactRecord } from "../src/redaction.js";
import {
  captureRedactedEffect,
  createRedactionPolicyEffect,
  redactRecordEffect,
} from "../src/redaction-effect.js";
import type { RedactionPolicy } from "../src/redaction.types.js";
test("Effect redaction preserves adapter output and bounds a safe capture", async () => {
  const policy = { mode: "development-redacted" as const, maxBytes: 1024 };
  const value = { token: "private", message: "ready" };
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const normalized = yield* createRedactionPolicyEffect(policy);
      const record = yield* redactRecordEffect(value, policy);
      const capture = yield* captureRedactedEffect(value, policy);
      return { normalized, record, capture };
    }),
  );
  expect(result.normalized).toEqual(createRedactionPolicy(policy));
  expect(result.record).toEqual(redactRecord(value, policy));
  expect(result.capture).toEqual(captureRedacted(value, policy));
  expect(JSON.stringify(result.capture)).not.toContain("private");
});
test("Effect redaction tags invalid policies and records failure metrics", async () => {
  const policy = { mode: "invalid" } as unknown as RedactionPolicy;
  const registry = new Map();
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const error = yield* redactRecordEffect({ secret: "private" }, policy).pipe(Effect.flip);
      const failure = yield* Metric.value(
        Metric.counter("relkit_observability_redaction_total", {
          attributes: { operation: "record", outcome: "failure" },
        }),
      );
      yield* redactRecordEffect({ safe: true });
      const success = yield* Metric.value(
        Metric.counter("relkit_observability_redaction_total", {
          attributes: { operation: "record", outcome: "success" },
        }),
      );
      return { error, failure, success };
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  expect(result.error).toMatchObject({ _tag: "RedactionError" });
  expect(result.failure.count).toBe(1);
  expect(result.success.count).toBe(1);
  expect(() => redactRecord({ safe: true }, policy)).toThrow(TypeError);
});
