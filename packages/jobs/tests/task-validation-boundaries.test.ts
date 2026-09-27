import { expect, test } from "vitest";
import { z } from "@relkit/schema";
import { Effect, Result } from "effect";
import {
  copyDependencies,
  copyDependenciesEffect,
  copyErrors,
  copyErrorsEffect,
  copyStreams,
  copyStreamsEffect,
  TaskValidationFailure,
} from "../src/task-validation.ts";

test("task dependency declarations reject unsupported shapes before binding", () => {
  const valid = copyDependencies({ tasks: {}, jobs: {} });
  expect(valid).toEqual({ tasks: {}, jobs: {} });
  expect(Object.isFrozen(valid)).toBe(true);
  expect(Object.isFrozen(valid?.tasks)).toBe(true);

  const invalid = [
    null,
    { functions: {} },
    { unrecognized: {} },
    { tasks: null },
    { tasks: { "bad name": {} } },
    { tasks: { valid: {} } },
  ];
  for (const value of invalid) {
    const result = Effect.runSync(Effect.result(copyDependenciesEffect(value)));
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) expect(result.failure).toBeInstanceOf(TaskValidationFailure);
    expect(() => copyDependencies(value)).toThrow(TypeError);
  }
});

test("task error and stream declarations keep validation in the Effect path", () => {
  expect(copyErrors(undefined)).toBeUndefined();
  expect(copyStreams(undefined)).toBeUndefined();
  expect(copyErrors([])).toEqual([]);
  expect(Object.isFrozen(copyErrors([]))).toBe(true);
  const streams = copyStreams({ updates: z.string() });
  expect(Object.keys(streams ?? {})).toEqual(["updates"]);
  expect(Object.isFrozen(streams)).toBe(true);

  for (const value of [null, [{}]]) {
    const result = Effect.runSync(Effect.result(copyErrorsEffect(value)));
    expect(Result.isFailure(result)).toBe(true);
    expect(() => copyErrors(value)).toThrow(TypeError);
  }
  for (const value of [null, { "bad name": z.string() }, { updates: {} }]) {
    const result = Effect.runSync(Effect.result(copyStreamsEffect(value)));
    expect(Result.isFailure(result)).toBe(true);
    expect(() => copyStreams(value)).toThrow(TypeError);
  }
});
