import { expect, test } from "vitest";
import { Effect } from "effect";
import {
  recordTime,
  recordTimeEffect,
  validateLocalRecord,
  validateLocalRecordEffect,
  type LocalRecord,
} from "../src/local/types.ts";

const record: LocalRecord = {
  key: "source:1",
  origin: "application",
  record: {
    version: 2,
    signal: "log",
    timestamp: "2026-09-02T00:00:00.000Z",
    level: "info",
    component: "test",
    message: "safe",
    fields: {},
  },
};

test("local validation accepts an envelope through Effect and the adapter", () => {
  expect(Effect.runSync(validateLocalRecordEffect(record))).toBe(record);
  validateLocalRecord(record);
  expect(Effect.runSync(recordTimeEffect(record.record))).toBe(recordTime(record.record));
});

test("local validation exposes tagged failures and preserves TypeError adapters", () => {
  const cases: readonly (readonly [unknown, string])[] = [
    [null, "envelope"],
    [{ ...record, key: "" }, "key"],
    [{ ...record, record: null }, "record"],
    [{ ...record, record: { ...record.record, timestamp: "invalid" } }, "timestamp"],
    [{ ...record, record: { ...record.record, level: "invalid" } }, "log"],
  ];
  for (const [value, reason] of cases) {
    const error = Effect.runSync(
      validateLocalRecordEffect(value).pipe(
        Effect.catchTag("LocalRecordValidationError", (failure) => Effect.succeed(failure)),
      ),
    );
    expect(error).toMatchObject({ _tag: "LocalRecordValidationError", reason });
    expect(() => validateLocalRecord(value)).toThrow(TypeError);
  }
});
