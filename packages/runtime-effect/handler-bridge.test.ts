import { Cause, Effect } from "effect";
import { describe, expect, test } from "bun:test";
import { invokeUserHandler } from "./src/handler-bridge.js";
import { normalizeFailure, toPublicEnvelope } from "./src/failure.js";

const context = () => ({ signal: new AbortController().signal });

describe("runtime handler bridge", () => {
  test("runs synchronous and Promise handlers with the fiber signal", async () => {
    let syncSignal: AbortSignal | undefined;
    const sync = await Effect.runPromise(
      invokeUserHandler({
        input: "sync",
        publicContext: context(),
        handler: (input, current) => {
          syncSignal = current.signal;
          return input.toUpperCase();
        },
      }),
    );
    const async = await Effect.runPromise(
      invokeUserHandler({
        input: "async",
        publicContext: context(),
        handler: async (input, current) => {
          expect(current.signal).toBeInstanceOf(AbortSignal);
          return `${input}-done`;
        },
      }),
    );

    expect(sync).toBe("SYNC");
    expect(async).toBe("async-done");
    expect(syncSignal).toBeInstanceOf(AbortSignal);
  });

  test("normalizes synchronous throws and Promise rejections", async () => {
    const thrown = await Effect.runPromiseExit(
      invokeUserHandler({
        input: undefined,
        publicContext: context(),
        handler: () => {
          throw new Error("bug");
        },
      }),
    );
    const rejected = await Effect.runPromiseExit(
      invokeUserHandler({
        input: undefined,
        publicContext: context(),
        handler: async () => Promise.reject(new Error("provider broke")),
      }),
    );

    expect(thrown._tag).toBe("Failure");
    expect(rejected._tag).toBe("Failure");
    if (thrown._tag === "Failure") expect(normalizeFailure(thrown.cause).kind).toBe("defect");
    if (rejected._tag === "Failure") expect(normalizeFailure(rejected.cause).kind).toBe("defect");
  });

  test("preserves declared error envelopes", async () => {
    const failure = Object.assign(new Error("Order missing"), {
      name: "DeclaredError",
      id: "orders.not-found",
      ref: { kind: "error", id: "orders.not-found" },
      data: { orderId: "order-1" },
      retry: "never" as const,
      http: { status: 404 },
    });
    const exit = await Effect.runPromiseExit(
      invokeUserHandler({
        input: undefined,
        publicContext: context(),
        handler: () => Promise.reject(failure),
      }),
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const reason = exit.cause.reasons.find(Cause.isFailReason);
      expect(reason).toBeDefined();
      if (reason !== undefined)
        expect(toPublicEnvelope(normalizeFailure(reason.error))).toEqual({
          kind: "application",
          outcome: "declared-error",
          code: "orders.not-found",
          message: "Order missing",
          data: { orderId: "order-1" },
          status: 404,
          retry: "never",
        });
    }
  });

  test("normalizes returned plain and Effect failures", async () => {
    const failure = Object.assign(new Error("Order missing"), {
      name: "DeclaredError",
      id: "orders.not-found",
      ref: { kind: "error", id: "orders.not-found" },
      data: { orderId: "order-1" },
      retry: "never" as const,
      http: { status: 404 },
    });
    const plain = await Effect.runPromiseExit(
      invokeUserHandler({
        input: undefined,
        publicContext: context(),
        handler: () => ({ _tag: "FunctionFailure" as const, error: failure }),
      }),
    );
    const effect = await Effect.runPromiseExit(
      invokeUserHandler({
        input: undefined,
        publicContext: context(),
        handler: () => Effect.fail(failure),
      }),
    );

    for (const exit of [plain, effect]) {
      expect(exit._tag).toBe("Failure");
      if (exit._tag === "Failure") {
        const reason = exit.cause.reasons.find(Cause.isFailReason);
        expect(reason).toBeDefined();
        if (reason !== undefined) expect(normalizeFailure(reason.error).kind).toBe("application");
      }
    }
  });

  test("interrupts once and ignores a late Promise settlement", async () => {
    const controller = new AbortController();
    let resolveHandler!: (value: string) => void;
    let started!: () => void;
    const handlerStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const execution = Effect.runPromiseExit(
      invokeUserHandler({
        input: undefined,
        publicContext: context(),
        handler: (_input, current) => {
          expect(current.signal).not.toBe(controller.signal);
          started();
          return new Promise<string>((resolve) => {
            resolveHandler = resolve;
          });
        },
      }),
      { signal: controller.signal },
    );

    await handlerStarted;
    controller.abort(new Error("cancelled"));
    const exit = await execution;
    resolveHandler("late");

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true);
  });
});
