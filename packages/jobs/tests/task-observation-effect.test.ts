import { expect, test } from "vitest";
import { Effect, Result } from "effect";
import { z } from "@relkit/schema";
import {
  copyObservation,
  copyObservationEffect,
  TaskObservationError,
} from "../src/task-observation-validation.ts";

const streams = { log: z.string() };

test("defaults declared progress and streams to live observation", async () => {
  const normalized = await Effect.runPromise(copyObservationEffect(undefined, z.string(), streams));
  expect(normalized).toEqual({ progress: "live", streams: { log: "live" } });
  expect(Object.isFrozen(normalized)).toBe(true);
  expect(
    await Effect.runPromise(copyObservationEffect(undefined, undefined, undefined)),
  ).toBeUndefined();
  expect(
    await Effect.runPromise(
      copyObservationEffect({ streams: { log: "history" } }, undefined, streams),
    ),
  ).toEqual({ streams: { log: "history" } });
});

test("rejects contradictory declarations with a typed failure", async () => {
  const invalid = await Effect.runPromise(
    Effect.result(copyObservationEffect({ streams: { missing: "live" } }, undefined, streams)),
  );
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) {
    expect(invalid.failure).toBeInstanceOf(TaskObservationError);
    expect(invalid.failure._tag).toBe("Jobs.TaskObservationError");
    expect(invalid.failure.reason).toContain("Undeclared");
  }
  expect(() => copyObservation({ progress: "durable" }, undefined, streams)).toThrow(TypeError);
  expect(() => copyObservation({ streams: { log: "unknown" } }, undefined, streams)).toThrow(
    "Invalid observation guarantee",
  );
});
