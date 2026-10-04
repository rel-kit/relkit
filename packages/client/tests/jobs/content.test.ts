import { expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { JobContent } from "../../src/jobs/content.service.js";
import { watchJobStream } from "../../src/jobs/stream.js";

it.effect("an acquired stream preserves the caller's original pre-pull abort reason", () =>
  Effect.promise(async () => {
    const caller = new AbortController();
    const original = { aborted: "original caller object" };
    let returned = 0;
    const client = {
      jobs: {
        job: {
          runs: {
            stream: async () => ({
              next: async () => ({ done: true as const, value: undefined }),
              return: async () => {
                returned++;
                return { done: true as const, value: undefined };
              },
            }),
          },
        },
      },
    };
    const stream = await watchJobStream(client, "job", {
      runId: "run",
      name: "content",
      signal: caller.signal,
    });
    const iterator = stream[Symbol.asyncIterator]();
    try {
      caller.abort(original);
      await expect(iterator.next()).rejects.toBe(original);
      expect(returned).toBe(1);
    } finally {
      await iterator.return?.();
    }
  }),
);

it.effect("interruption during eager iterator transfer releases the acquired native prefix", () =>
  Effect.promise(async () => {
    const caller = new AbortController();
    let returned = 0;
    let request: AbortSignal | undefined;
    const client = {
      jobs: {
        job: {
          runs: {
            stream: async (_input: unknown, options: { signal: AbortSignal }) => {
              request = options.signal;
              return {
                [Symbol.asyncIterator]: () => {
                  caller.abort(new Error("cancel transfer"));
                  return {
                    next: async () => ({ done: true as const, value: undefined }),
                    return: async () => {
                      returned++;
                      return { done: true as const, value: undefined };
                    },
                  };
                },
              };
            },
          },
        },
      },
    };
    await expect(
      watchJobStream(client, "job", { runId: "run", name: "content", signal: caller.signal }),
    ).rejects.toBeDefined();
    expect(request?.aborted).toBe(true);
    expect(returned).toBe(1);
  }),
);

it.effect("named content substitutes its complete service contract", () =>
  Effect.gen(function* () {
    const content = yield* JobContent;
    const values = yield* content.open({}, "job", { runId: "run", name: "content" });
    const collected = yield* Effect.promise(async () => {
      const result = [];
      for await (const frame of values) result.push(frame);
      return result;
    });
    expect(collected).toEqual([]);
  }).pipe(
    Effect.provide(
      Layer.succeed(
        JobContent,
        JobContent.of({
          open: Effect.fn("TestContent.open")(() =>
            Effect.succeed({ async *[Symbol.asyncIterator]() {} }),
          ),
        }),
      ),
    ),
  ),
);
