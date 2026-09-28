import { expect, test } from "vitest";
import { Effect, Result } from "effect";
import {
  assertHook,
  assertHookEffect,
  copyStrings,
  copyStringsEffect,
  hasOwnEffect,
  isRecordEffect,
  isSchemaEffect,
  TaskSupportError,
} from "../src/define-task-support.ts";

test("Effect helpers copy bounded strings and inspect authoring shapes", async () => {
  const copied = await Effect.runPromise(copyStringsEffect(["alpha", "beta"], "tags"));
  expect(copied).toEqual(["alpha", "beta"]);
  expect(Object.isFrozen(copied)).toBe(true);
  expect(await Effect.runPromise(copyStringsEffect(undefined, "tags"))).toBeUndefined();
  expect(await Effect.runPromise(isRecordEffect({ id: 1 }))).toBe(true);
  expect(await Effect.runPromise(isRecordEffect([]))).toBe(false);
  expect(await Effect.runPromise(hasOwnEffect({ id: 1 }, "id"))).toBe(true);
  expect(
    await Effect.runPromise(
      isSchemaEffect({
        "~standard": { version: 1, validate: () => ({ value: 1 }) },
      }),
    ),
  ).toBe(true);
  expect(await Effect.runPromise(isSchemaEffect({ "~standard": { version: 2 } }))).toBe(false);
  await Effect.runPromise(assertHookEffect(() => undefined, "onStart"));
});

test("invalid fields use a tagged error while adapters retain TypeError", async () => {
  const duplicate = await Effect.runPromise(
    Effect.result(copyStringsEffect(["alpha", "alpha"], "tags")),
  );
  expect(Result.isFailure(duplicate)).toBe(true);
  if (Result.isFailure(duplicate)) {
    expect(duplicate.failure).toBeInstanceOf(TaskSupportError);
    expect(duplicate.failure._tag).toBe("Jobs.TaskSupportError");
  }
  expect(() => copyStrings(["alpha", "alpha"], "tags")).toThrow(TypeError);
  expect(() => copyStrings([1], "tags")).toThrow("non-empty strings");
  expect(() => assertHook("invalid", "onStart")).toThrow("must be a function");
});
