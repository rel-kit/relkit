import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import {
  copySchedules,
  copySchedulesEffect,
  ScheduleValidationError,
} from "../src/schedule-validation.ts";
test("Effect copies valid schedules and preserves the sync API", async () => {
  const definitions = [{ id: "hourly", every: "1 hour", input: { ok: true } }];
  const result = await Effect.runPromise(copySchedulesEffect(definitions));
  expect(result).toEqual(copySchedules(definitions));
  expect(Object.isFrozen(result)).toBe(true);
});
test("invalid schedule has a tagged Effect failure", async () => {
  const definitions = [{ id: "bad", every: "0 seconds", input: null }];
  const result = await Effect.runPromise(Effect.result(copySchedulesEffect(definitions)));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(ScheduleValidationError);
  expect(() => copySchedules(definitions)).toThrow(TypeError);
});
