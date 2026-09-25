import { describe, expect, test } from "vitest";
import { Effect, Layer } from "effect";
import {
  AbortIO,
  ContextFactoryFailure,
  linkSignals,
  linkSignalsEffect,
  makeContext,
  makeContextEffect,
} from "../src/index.js";
import type { InvocationRecord } from "../src/index.js";

const record: InvocationRecord = {
  id: "invocation-1",
  functionId: "orders.get",
  traceId: "trace-1",
  startedAt: new Date(0).toISOString(),
  attempt: 1,
  source: "direct",
  status: "started",
};
const time = { now: () => new Date(0), sleep: async () => undefined };

describe("public invocation context Effect", () => {
  test("creates a frozen default context and observes its fallback methods", async () => {
    const signal = new AbortController().signal;
    const context = Effect.runSync(
      makeContextEffect(undefined, record, signal, { token: "secret" }, time),
    );
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.env)).toBe(true);
    expect(context.env).toEqual({ token: "secret" });
    context.log.info("ignored");
    expect(await context.auth.getSession()).toBeNull();
  });

  test("tags custom factory failures and preserves the public rejection", async () => {
    const failure = new Error("factory offline");
    const signal = new AbortController().signal;
    const factory = (): Promise<{ signal: AbortSignal }> => Promise.reject(failure);
    const tagged = await Effect.runPromise(
      Effect.catchTag(
        makeContextEffect(factory, record, signal, {}, time),
        "ContextFactoryFailure",
        (error) => Effect.succeed(error),
      ),
    );
    expect(tagged).toBeInstanceOf(ContextFactoryFailure);
    expect(tagged.cause).toBe(failure);
    await expect(makeContext(factory, record, signal, {}, time)).rejects.toBe(failure);
  });

  test("links and releases signals through an injectable listener Layer", () => {
    const parent = new AbortController();
    const target = new AbortController();
    let listens = 0;
    let removals = 0;
    const layer = Layer.succeed(AbortIO, {
      createController: () => new AbortController(),
      listen: (signal: AbortSignal, onAbort: () => void) => {
        listens += 1;
        signal.addEventListener("abort", onAbort);
        return () => {
          removals += 1;
          signal.removeEventListener("abort", onAbort);
        };
      },
    });
    const handle = Effect.runSync(
      Effect.provide(linkSignalsEffect(target, [undefined, parent.signal]), layer),
    );
    expect(listens).toBe(1);
    const reason = new Error("parent cancelled");
    parent.abort(reason);
    expect(target.signal.reason).toBe(reason);
    Effect.runSync(handle.unlinkEffect());
    handle.unlink();
    expect(removals).toBe(1);
    const second = new AbortController();
    const unlink = linkSignals(second, [parent.signal]);
    expect(second.signal.reason).toBe(reason);
    unlink();
  });

  test("releases earlier links if a later registration fails", () => {
    const first = new AbortController();
    const second = new AbortController();
    const target = new AbortController();
    let removals = 0;
    const layer = Layer.succeed(AbortIO, {
      createController: () => new AbortController(),
      listen: (signal: AbortSignal, onAbort: () => void) => {
        if (signal === second.signal) throw new Error("registration failed");
        signal.addEventListener("abort", onAbort);
        return () => {
          removals += 1;
          signal.removeEventListener("abort", onAbort);
        };
      },
    });
    expect(() =>
      Effect.runSync(
        Effect.provide(linkSignalsEffect(target, [first.signal, second.signal]), layer),
      ),
    ).toThrow("registration failed");
    expect(removals).toBe(1);
    first.abort("late");
    expect(target.signal.aborted).toBe(false);
  });

  test("propagates an abort fired during listener registration", () => {
    const parent = new AbortController();
    const target = new AbortController();
    const layer = Layer.succeed(AbortIO, {
      createController: () => new AbortController(),
      listen: (_signal: AbortSignal, onAbort: () => void) => {
        parent.abort("during registration");
        onAbort();
        return () => undefined;
      },
    });
    const handle = Effect.runSync(
      Effect.provide(linkSignalsEffect(target, [parent.signal]), layer),
    );
    expect(target.signal.reason).toBe("during registration");
    handle.unlink();
  });
});
