import { expect, test } from "vitest";
import { Effect, Layer, Result } from "effect";
import {
  JobIdentityError,
  retryOperationIdentity,
  retryOperationIdentityEffect,
  scheduleOccurrenceIdentity,
  scheduleOccurrenceIdentityEffect,
  stableIdentityTuple,
  stableIdentityTupleEffect,
  taskOperationIdentity,
  taskOperationIdentityEffect,
} from "../src/identity.ts";
import { JobsTelemetry } from "../src/jobs-observability.ts";

test("Effect identities preserve tuple order and primitive distinctions", async () => {
  expect(await Effect.runPromise(stableIdentityTupleEffect([1]))).not.toBe(
    await Effect.runPromise(stableIdentityTupleEffect(["1"])),
  );
  expect(await Effect.runPromise(stableIdentityTupleEffect([-0]))).not.toBe(
    await Effect.runPromise(stableIdentityTupleEffect([0])),
  );
  expect(await Effect.runPromise(stableIdentityTupleEffect([undefined, null, [true]]))).toBe(
    stableIdentityTuple([undefined, null, [true]]),
  );
  expect(await Effect.runPromise(taskOperationIdentityEffect("a", "send"))).toBe(
    taskOperationIdentity("a", "send"),
  );
  expect(await Effect.runPromise(retryOperationIdentityEffect("r", "op"))).toBe(
    retryOperationIdentity("r", "op"),
  );
  expect(await Effect.runPromise(scheduleOccurrenceIdentityEffect("s", "now"))).toBe(
    scheduleOccurrenceIdentity("s", "now"),
  );
});

test("unsupported object values fail with a tagged Effect error", async () => {
  const invalid = [{ fn: () => undefined }];
  const result = await Effect.runPromise(Effect.result(stableIdentityTupleEffect(invalid)));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) {
    expect(result.failure).toBeInstanceOf(JobIdentityError);
    expect(result.failure._tag).toBe("Jobs.IdentityError");
  }
  expect(() => stableIdentityTuple(invalid)).toThrow();
});

test("identity operations use a substitutable telemetry Layer", async () => {
  const seen: string[] = [];
  const layer = Layer.succeed(
    JobsTelemetry,
    JobsTelemetry.of({
      observe: (operation, effect) => {
        seen.push(operation);
        return effect;
      },
    }),
  );
  await Effect.runPromise(Effect.provide(taskOperationIdentityEffect("a", "send"), layer));
  expect(seen).toEqual(["identity.taskOperation", "identity.stableTuple"]);
});
