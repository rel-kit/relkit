import { expect, test } from "vitest";
import { Effect, Metric } from "effect";
import {
  inQueryTimeRangeEffect,
  matchesQueryEffect,
  positiveQueryEffect,
  queryResponseEffect,
  validateQueryEffect,
} from "../src/query-validation-effect.js";
import { positive, validate } from "../src/query-validation.js";
import { ObservabilityQueryError } from "../src/query-types.js";
import type { ObservabilityQueryRequest } from "../src/query-types.js";
test("Effect query rules normalize, match, and return immutable pages", async () => {
  const record = {
    version: 2 as const,
    signal: "log" as const,
    timestamp: "2026-09-25T00:00:00.000Z",
    level: "info" as const,
    component: "test",
    message: "ready",
  };
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const query = yield* validateQueryEffect({ search: "ready", limit: 10 }, 5);
      const matches = yield* matchesQueryEffect(record, query);
      const inTime = yield* inQueryTimeRangeEffect(record.timestamp, query);
      const page = yield* queryResponseEffect([record], "2");
      const bound = yield* positiveQueryEffect(1000);
      return { query, matches, inTime, page, bound };
    }),
  );
  expect(result.query.limit).toBe(5);
  expect(result.matches).toBe(true);
  expect(result.inTime).toBe(true);
  expect(result.page.nextCursor).toBe("2");
  expect(Object.isFrozen(result.page.items)).toBe(true);
  expect(result.bound).toBe(100);
  expect(validate({ limit: 10 }, 5).limit).toBe(5);
});
test("Effect query errors are tagged and adapters keep their public codes", async () => {
  const invalid = await Effect.runPromise(
    validateQueryEffect({ version: 2 as 1 }, 100).pipe(Effect.flip),
  );
  expect(invalid).toMatchObject({
    _tag: "QueryValidationError",
    code: "RELKIT_OBSERVABILITY_QUERY_PROTOCOL_MISMATCH",
  });
  const bound = await Effect.runPromise(positiveQueryEffect(0).pipe(Effect.flip));
  expect(bound.code).toBe("RELKIT_OBSERVABILITY_QUERY_INVALID");
  expect(() => positive(0)).toThrow(ObservabilityQueryError);
  const malformed = { cursor: 7 } as unknown as ObservabilityQueryRequest;
  const cursorError = await Effect.runPromise(
    validateQueryEffect(malformed, 100).pipe(Effect.flip),
  );
  expect(cursorError.code).toBe("RELKIT_OBSERVABILITY_QUERY_INVALID");
  expect(() => validate(malformed, 100)).toThrow(ObservabilityQueryError);
});
test("query validation metrics record successes and failures", async () => {
  const registry = new Map();
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      yield* validateQueryEffect({ limit: 2 }, 10);
      yield* validateQueryEffect({ limit: 0 }, 10).pipe(Effect.flip);
      const success = yield* Metric.value(
        Metric.counter("relkit_observability_query_validation_total", {
          attributes: { operation: "validate", outcome: "success" },
        }),
      );
      const failure = yield* Metric.value(
        Metric.counter("relkit_observability_query_validation_total", {
          attributes: { operation: "validate", outcome: "failure" },
        }),
      );
      return { success, failure };
    }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
  );
  expect(result.success.count).toBe(1);
  expect(result.failure.count).toBe(1);
});
