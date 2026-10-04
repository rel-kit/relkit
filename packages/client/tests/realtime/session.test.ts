import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import {
  RealtimeSessions,
  realtimeSessionsLayer,
} from "../../src/react/realtime-session.service.js";
import type { RealtimeFrame } from "../../src/react/realtime-manager.types.js";
import { checkpoint } from "./session-fixture.js";

it.effect("shares a scoped session, consumes in order and releases only its final borrower", () =>
  Effect.gen(function* () {
    const opened = yield* Deferred.make<void>();
    const received = yield* Deferred.make<void>();
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
        Effect.runSync(Deferred.succeed(opened, undefined));
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
    yield* Effect.gen(function* () {
      const sessions = yield* RealtimeSessions;
      const left: RealtimeFrame[] = [];
      const right: RealtimeFrame[] = [];
      const releaseLeft = yield* sessions.subscribe("declared", { room: 1 }, (value) =>
        left.push(value),
      );
      const releaseRight = yield* sessions.subscribe("declared", { room: 1 }, (value) => {
        right.push(value);
        if (right.length === 2) Effect.runSync(Deferred.succeed(received, undefined));
      });
      yield* Deferred.await(opened);
      yield* Deferred.await(received);
      expect(opens).toBe(1);
      expect(left).toEqual(values);
      expect(right).toEqual(values);
      expect([...sessions.feeds.values()][0]?.checkpoint).toBe(secondCheckpoint);
      yield* releaseLeft;
      expect(activeSignal?.aborted).toBe(false);
      expect(sessions.feeds.size).toBe(1);
      yield* releaseRight;
      expect(activeSignal?.aborted).toBe(true);
      expect(sessions.feeds.size).toBe(0);
      expect(yield* sessions.snapshot()).toBe("idle");
      yield* releaseRight;
    }).pipe(Effect.provide(realtimeSessionsLayer(client)));
    expect(returns).toBe(1);
  }),
);

it.effect("reconnect uses injected time and retains the last checkpoint", () =>
  Effect.gen(function* () {
    const first = yield* Deferred.make<void>();
    const retried = yield* Deferred.make<void>();
    const calls: unknown[] = [];
    const saved = checkpoint("1");
    const client = {
      "relkit.realtime.subscribe": async (input: unknown) => {
        calls.push(input);
        if (calls.length === 1)
          return {
            async *[Symbol.asyncIterator]() {
              yield { kind: "caught-up", checkpoint: saved } satisfies RealtimeFrame;
              Effect.runSync(Deferred.succeed(first, undefined));
            },
          };
        Effect.runSync(Deferred.succeed(retried, undefined));
        return { async *[Symbol.asyncIterator]() {} };
      },
    };
    yield* Effect.gen(function* () {
      const sessions = yield* RealtimeSessions;
      const release = yield* sessions.subscribe("declared", {}, () => undefined);
      yield* Deferred.await(first);
      yield* TestClock.adjust("250 millis");
      yield* Deferred.await(retried);
      expect(calls).toHaveLength(2);
      expect(calls[1]).toMatchObject({ after: saved });
      yield* release;
    }).pipe(Effect.provide(realtimeSessionsLayer(client)));
  }),
);

it.effect("a test Layer substitutes the complete realtime service without native resources", () =>
  Effect.gen(function* () {
    const sessions = yield* RealtimeSessions;
    expect(yield* sessions.snapshot()).toBe("connected");
  }).pipe(
    Effect.provide(
      Layer.succeed(
        RealtimeSessions,
        RealtimeSessions.of({
          feeds: new Map(),
          statusListeners: new Set(),
          snapshot: () => Effect.succeed("connected"),
          stop: () => Effect.void,
          subscribe: () => Effect.succeed(Effect.void),
        }),
      ),
    ),
  ),
);
