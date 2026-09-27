import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import {
  copyTriggerOptions,
  copyTriggerOptionsEffect,
  TriggerValidationError,
  validateResultOptions,
  validateResultOptionsEffect,
} from "../src/trigger-validation.ts";
test("Effect validates trigger and result options with sync compatibility", async () => {
  const copied = await Effect.runPromise(copyTriggerOptionsEffect({ operationId: "op-1" }));
  expect(copied).toEqual(copyTriggerOptions({ operationId: "op-1" }));
  const result = await Effect.runPromise(validateResultOptionsEffect({ timeout: "1 second" }));
  expect(result).toEqual(validateResultOptions({ timeout: "1 second" }));
});
test("invalid trigger options fail with a tagged Effect error", async () => {
  const invalid = { delay: "1 second", at: "2026-01-01T00:00:00Z" };
  const result = await Effect.runPromise(Effect.result(copyTriggerOptionsEffect(invalid)));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(TriggerValidationError);
  expect(() => copyTriggerOptions(invalid)).toThrow(TypeError);
  expect(() => validateResultOptions({})).toThrow(TypeError);
});
