import { expect, test } from "vitest";
import { z } from "@relkit/schema";
import { Effect, Layer, Result } from "effect";
import {
  createTaskProgressEmitter,
  createTaskProgressEmitterEffect,
  createTaskStreamEmitter,
  createTaskStreamEmitterEffect,
  TaskEmissionError,
  TaskEmissionFailure,
} from "../src/index.ts";
import { JobsTelemetry } from "../src/jobs-observability.ts";
test("validates progress and stream inputs and returns delivery receipts", async () => {
  let transforms = 0;
  let progressValue = "";
  const progress = createTaskProgressEmitter(
    z.string().transform((value) => {
      transforms += 1;
      return value.trim();
    }),
    {
      sink: (value) => {
        progressValue = value as string;
      },
    },
  );
  await expect(progress.emit(" ready ")).resolves.toEqual({ outcome: "sent" });
  expect(progressValue).toBe("ready");
  expect(transforms).toBe(1);
  let identity: { readonly name: string; readonly generation?: string } | undefined;
  const stream = createTaskStreamEmitter(z.string(), {
    name: "text",
    generation: "attempt-1",
    sink: (_value, _signal, received) => {
      identity = received;
      return { outcome: "persisted" };
    },
    durable: true,
  });
  await expect(stream.emit("chunk")).resolves.toEqual({ outcome: "persisted" });
  expect(identity).toEqual({ name: "text", generation: "attempt-1" });
});
test("reports live delivery loss and rejects durable delivery loss", async () => {
  const live = createTaskProgressEmitter(z.string(), {
    sink: () => Promise.reject(new Error("offline")),
  });
  await expect(live.emit("value")).resolves.toMatchObject({ outcome: "unavailable" });
  const durable = createTaskProgressEmitter(z.string(), {
    durable: true,
    sink: () => Promise.reject(new Error("offline")),
  });
  await expect(durable.emit("value")).rejects.toMatchObject({
    code: "RELKIT_TASK_PROGRESS_PERSISTENCE",
  });
  await expect(createTaskProgressEmitter(z.string()).emit(42 as never)).rejects.toBeInstanceOf(
    TaskEmissionError,
  );
});
test("enforces item size and stream naming contracts", async () => {
  expect(() => createTaskStreamEmitter(z.string(), { name: "bad-name" })).toThrow();
  await expect(
    createTaskProgressEmitter(z.string()).emit("x".repeat(64 * 1024)),
  ).rejects.toMatchObject({
    code: "RELKIT_TASK_PROGRESS_TOO_LARGE",
  });
});
test("Effect emitters expose typed failures and substitutable operation telemetry", async () => {
  const seen: string[] = [];
  const telemetry = Layer.succeed(
    JobsTelemetry,
    JobsTelemetry.of({
      observe: (operation, effect) => {
        seen.push(operation);
        return effect;
      },
    }),
  );
  const progress = await Effect.runPromise(
    Effect.provide(
      createTaskProgressEmitterEffect(z.string(), { sink: () => ({ outcome: "sent" }) }),
      telemetry,
    ),
  );
  await expect(
    Effect.runPromise(Effect.provide(progress.emitEffect("ok"), telemetry)),
  ).resolves.toEqual({ outcome: "sent" });
  const failed = await Effect.runPromise(
    Effect.result(Effect.provide(progress.emitEffect(42 as never), telemetry)),
  );
  expect(Result.isFailure(failed)).toBe(true);
  if (Result.isFailure(failed)) {
    expect(failed.failure).toBeInstanceOf(TaskEmissionFailure);
    expect(failed.failure.code).toBe("RELKIT_TASK_PROGRESS_INVALID");
  }
  const stream = await Effect.runPromise(
    Effect.provide(createTaskStreamEmitterEffect(z.string(), { name: "events" }), telemetry),
  );
  await Effect.runPromise(Effect.provide(stream.emitEffect("value"), telemetry));
  expect(seen).toEqual([
    "task.createProgressEmitter",
    "task.emitProgress",
    "task.emitProgress",
    "task.createStreamEmitter",
    "jobName.assert",
    "jobName.is",
    "task.emitStream",
  ]);
});
