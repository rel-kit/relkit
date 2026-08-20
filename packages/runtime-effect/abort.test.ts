import { Cause, Effect } from "effect";
import { describe, expect, test } from "bun:test";
import { abortablePromise, invokeUserHandler } from "./src/index.js";
import { normalizeFailure } from "./src/failure.js";

describe("runtime abort bridge", () => {
  test("aborts the public signal and provider Promise on fiber interruption", async () => {
    const parent = new AbortController();
    let publicSignal!: AbortSignal;
    let providerSignal!: AbortSignal;
    let started!: () => void;
    const providerStarted = new Promise<void>((resolve) => {
      started = resolve;
    });

    const execution = Effect.runPromiseExit(
      invokeUserHandler({
        input: undefined,
        publicContext: { signal: new AbortController().signal },
        handler: (_input, _request, context) => {
          publicSignal = context.signal;
          return abortablePromise(context.signal, (signal) => {
            providerSignal = signal;
            started();
            return new Promise<string>(() => undefined);
          });
        },
      }),
      { signal: parent.signal },
    );

    await providerStarted;
    parent.abort(new Error("cancelled"));
    const exit = await execution;

    expect(publicSignal.aborted).toBe(true);
    expect(providerSignal).toBe(publicSignal);
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true);
  });

  test("skips handler work for a pre-aborted public signal", async () => {
    const parent = new AbortController();
    parent.abort(new Error("already cancelled"));
    let called = false;

    const exit = await Effect.runPromiseExit(
      invokeUserHandler({
        input: undefined,
        publicContext: { signal: parent.signal },
        handler: () => {
          called = true;
          return "never";
        },
      }),
    );

    expect(called).toBe(false);
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const reason = exit.cause.reasons.find(Cause.isFailReason);
      expect(reason).toBeDefined();
      if (reason !== undefined) expect(normalizeFailure(reason.error).kind).toBe("cancellation");
    }
  });

  test("removes parent abort listeners after completion", async () => {
    const parent = new AbortController();
    let publicSignal!: AbortSignal;
    const result = await Effect.runPromise(
      invokeUserHandler({
        input: undefined,
        publicContext: { signal: parent.signal },
        handler: (_input, _request, context) => {
          publicSignal = context.signal;
          return "done";
        },
      }),
    );

    parent.abort(new Error("too late"));
    expect(result).toBe("done");
    expect(publicSignal.aborted).toBe(false);
  });
});
