import { afterEach, expect, it, vi } from "vitest";
import { createRealtimeSessions } from "../../src/react/realtime-session.service.js";
import type { RealtimeFrame } from "../../src/react/realtime-manager.types.js";
import { checkpoint } from "./session-fixture.js";

afterEach(() => {
  vi.useRealTimers();
});

it("shares a session, consumes in order and releases only its final borrower", async () => {
  const opened = Promise.withResolvers<void>();
  const received = Promise.withResolvers<void>();
  let opens = 0;
  let returns = 0;
  let activeSignal: AbortSignal | undefined;
  const secondCheckpoint = checkpoint("2");
  const values: RealtimeFrame[] = [
    { kind: "caught-up", checkpoint: checkpoint("1") },
    { kind: "event", checkpoint: secondCheckpoint, event: "updated", payload: {} },
  ];
  const client = {
    "relkit.realtime.subscribe": async (_input: unknown, call: { signal: AbortSignal }) => {
      opens++;
      activeSignal = call.signal;
      opened.resolve();
      let index = 0;
      return {
        [Symbol.asyncIterator]: () => ({
          next: async () =>
            index < values.length
              ? { done: false as const, value: values[index++]! }
              : await new Promise<IteratorResult<RealtimeFrame>>((_resolve, reject) =>
                  call.signal.addEventListener("abort", () => reject(call.signal.reason), {
                    once: true,
                  }),
                ),
          return: async () => {
            returns++;
            return { done: true as const, value: undefined };
          },
        }),
      };
    },
  };
  const sessions = createRealtimeSessions(client);
  try {
    const left: RealtimeFrame[] = [];
    const right: RealtimeFrame[] = [];
    const releaseLeft = sessions.subscribe("declared", { room: 1 }, (value) => left.push(value));
    const releaseRight = sessions.subscribe("declared", { room: 1 }, (value) => {
      right.push(value);
      if (right.length === 2) received.resolve();
    });
    await opened.promise;
    await received.promise;
    expect(opens).toBe(1);
    expect(left).toEqual(values);
    expect(right).toEqual(values);
    expect(sessions.snapshot()).toBe("connected");
    expect([...sessions.feeds.values()][0]?.checkpoint).toBe(secondCheckpoint);
    releaseLeft();
    expect(activeSignal?.aborted).toBe(false);
    expect(sessions.feeds.size).toBe(1);
    releaseRight();
    expect(activeSignal?.aborted).toBe(true);
    expect(sessions.feeds.size).toBe(0);
    expect(sessions.snapshot()).toBe("idle");
    releaseRight();
  } finally {
    await sessions.close();
  }
  expect(returns).toBe(1);
  expect(() => sessions.subscribe("declared", {}, () => undefined)).toThrow(
    "Realtime manager is disposed.",
  );
});

it("reconnects after the retry delay and retains the last checkpoint", async () => {
  vi.useFakeTimers();
  const first = Promise.withResolvers<void>();
  const calls: unknown[] = [];
  const statuses: string[] = [];
  const saved = checkpoint("1");
  const client = {
    "relkit.realtime.subscribe": async (input: unknown) => {
      calls.push(input);
      if (calls.length === 1)
        return {
          async *[Symbol.asyncIterator]() {
            yield { kind: "caught-up", checkpoint: saved } satisfies RealtimeFrame;
            first.resolve();
          },
        };
      return { async *[Symbol.asyncIterator]() {} };
    },
  };
  const sessions = createRealtimeSessions(client);
  try {
    const release = sessions.subscribe(
      "declared",
      {},
      () => undefined,
      (status) => statuses.push(status),
    );
    await first.promise;
    await vi.advanceTimersByTimeAsync(249);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ after: saved });
    expect(statuses.slice(0, 4)).toEqual(["connecting", "connected", "stale", "connecting"]);
    release();
  } finally {
    await sessions.close();
  }
});

it("close aborts a pending retry delay and waits for the worker", async () => {
  let calls = 0;
  const failed = Promise.withResolvers<void>();
  const sessions = createRealtimeSessions({
    "relkit.realtime.subscribe": async () => {
      calls++;
      failed.resolve();
      throw new Error("offline");
    },
  });
  sessions.subscribe("declared", {}, () => undefined);
  await failed.promise;
  await sessions.close();
  expect(calls).toBe(1);
  expect(sessions.snapshot()).toBe("idle");
});
