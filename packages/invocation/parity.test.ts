import { Cause, Effect } from "effect";
import { describe, expect, test } from "bun:test";
import {
  InvocationValidationError,
  invokeUserHandler,
  makeContext,
  normalizeFailure,
  toPublicEnvelope,
  validated,
  type InvocationRecord,
  type InvocationTarget,
} from "./src/index.ts";
import { z } from "@zsys/schema";

const record: InvocationRecord = {
  id: "invocation-1",
  functionId: "orders.get",
  traceId: "trace-1",
  startedAt: new Date(0).toISOString(),
  attempt: 1,
  source: "direct",
  status: "started",
};

describe("shared invocation parity", () => {
  test("keeps Standard Schema validation and its error shape", async () => {
    await expect(validated(z.number(), "wrong", "input")).rejects.toBeInstanceOf(
      InvocationValidationError,
    );
    await expect(validated(z.number(), 4, "output")).resolves.toBe(4);
  });

  test("creates the same frozen default public context", async () => {
    const signal = new AbortController().signal;
    const time = { now: () => new Date(0), sleep: async () => undefined };
    const context = await makeContext(undefined, record, signal, { token: "secret" }, time);

    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.env)).toBe(true);
    expect(context.invocation).toBe(record);
    expect(context.signal).toBe(signal);
    expect(context.env).toEqual({ token: "secret" });
  });

  test("bridges sync, declared, and Effect handler outcomes", async () => {
    const context = () => ({ signal: new AbortController().signal });
    const sync = await Effect.runPromise(
      invokeUserHandler({
        input: "ok",
        publicContext: context(),
        handler: (value) => value.toUpperCase(),
      }),
    );
    expect(sync).toBe("OK");

    const declared = Object.assign(new Error("Order missing"), {
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
        handler: () => Effect.fail(declared),
      }),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const reason = exit.cause.reasons.find(Cause.isFailReason);
      expect(reason).toBeDefined();
      if (reason !== undefined) {
        expect(toPublicEnvelope(normalizeFailure(reason.error))).toMatchObject({
          kind: "application",
          code: "orders.not-found",
          status: 404,
          retry: "never",
        });
      }
    }
  });

  test("retains structural invocation targets", () => {
    const target: InvocationTarget<number, string> = {
      id: "orders.get",
      input: z.number(),
      output: z.string(),
      handler: (value) => String(value),
    };

    expect(
      target.handler(4, undefined, {
        invocation: record,
        signal: new AbortController().signal,
        env: {},
        log: { trace() {}, debug() {}, info() {}, warn() {}, error() {} },
        time: { now: () => new Date(0), sleep: async () => undefined },
        jobs: {},
        events: {},
        buckets: {},
        cache: {},
        agents: {},
      }),
    ).toBe("4");
  });
});
