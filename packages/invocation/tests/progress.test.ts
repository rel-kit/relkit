import { describe, expect, test } from "vitest";
import { Effect, Layer } from "effect";
import { z } from "@relkit/schema";
import {
  MAX_PROGRESS_RECORD_BYTES,
  ProgressEmissionError,
  ProgressEmissionFailure,
  ProgressIO,
  ProgressSinkFailure,
  ProgressValidationFailure,
  createProgressEmitter,
  createProgressEmitterEffect,
} from "../src/index.js";

describe("invocation progress", () => {
  test("validates and emits values before settlement", async () => {
    const signal = new AbortController().signal;
    const seen: unknown[] = [];
    const sink = { emit: (value: unknown, received: AbortSignal) => {
      expect(received).toBe(signal);
      seen.push(value);
    } };
    const handle = Effect.runSync(createProgressEmitterEffect(z.string(), signal, sink));
    await Effect.runPromise(handle.emitEffect("loading"));
    await handle.emitter.emit("ready");
    expect(seen).toEqual(["loading", "ready"]);
    Effect.runSync(handle.settleEffect());
    const failure = await Effect.runPromise(
      Effect.catchTag(handle.emitEffect("late"), "ProgressEmissionFailure", (error) =>
        Effect.succeed(error),
      ),
    );
    expect(failure).toBeInstanceOf(ProgressEmissionFailure);
    expect(failure.code).toBe("RELKIT_PROGRESS_AFTER_SETTLEMENT");
    await expect(handle.emitter.emit("late")).rejects.toMatchObject({
      code: "RELKIT_PROGRESS_AFTER_SETTLEMENT",
      name: "ProgressEmissionError",
    });
  });

  test("preserves public validation and size errors", async () => {
    const { emitter, settle } = createProgressEmitter(z.string(), new AbortController().signal);
    await expect(emitter.emit("ready")).resolves.toBeUndefined();
    await expect(emitter.emit(1)).rejects.toMatchObject({
      code: "RELKIT_PROGRESS_VALIDATION",
    });
    await expect(emitter.emit("x".repeat(MAX_PROGRESS_RECORD_BYTES))).rejects.toMatchObject({
      code: "RELKIT_PROGRESS_TOO_LARGE",
    });
    settle();
    await expect(emitter.emit("late")).rejects.toBeInstanceOf(ProgressEmissionError);
  });

  test("models sink failure by tag and keeps the original public rejection", async () => {
    const failure = new Error("sink offline");
    const handle = Effect.runSync(
      createProgressEmitterEffect(z.string(), new AbortController().signal, {
        emit: () => Promise.reject(failure),
      }),
    );
    const typed = await Effect.runPromise(
      Effect.catchTag(handle.emitEffect("ready"), "ProgressSinkFailure", (error) =>
        Effect.succeed(error),
      ),
    );
    expect(typed).toBeInstanceOf(ProgressSinkFailure);
    expect(typed.cause).toBe(failure);
    await expect(handle.emitter.emit("ready")).rejects.toBe(failure);
  });

  test("substitutes schema and sink IO through a Layer", async () => {
    const signal = new AbortController().signal;
    const seen: unknown[] = [];
    const handle = Effect.runSync(createProgressEmitterEffect(z.string(), signal));
    const layer = Layer.succeed(ProgressIO, {
      validate: async (_schema, value) => ({ value: `validated:${String(value)}` }),
      emit: async (_sink, value, received) => {
        expect(received).toBe(signal);
        seen.push(value);
      },
    });
    await Effect.runPromise(Effect.provide(handle.emitEffect(3), layer));
    expect(seen).toEqual(["validated:3"]);
  });

  test("keeps a rejecting validator in the typed Effect error channel", async () => {
    const failure = new Error("validator offline");
    const handle = Effect.runSync(createProgressEmitterEffect(z.number(), new AbortController().signal));
    const layer = Layer.succeed(ProgressIO, {
      validate: async () => { throw failure; },
      emit: async () => undefined,
    });
    const typed = await Effect.runPromise(Effect.provide(
      Effect.catchTag(handle.emitEffect(1), "ProgressValidationFailure", (error) =>
        Effect.succeed(error),
      ),
      layer,
    ));
    expect(typed).toBeInstanceOf(ProgressValidationFailure);
    expect(typed.cause).toBe(failure);
  });
});
