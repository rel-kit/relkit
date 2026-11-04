import { expect, it } from "vitest";
import type { JsonValue } from "relkit/contracts";
import type { NamedStreamFrame } from "relkit/contracts/jobs";
import { jobContent } from "../../src/jobs/content.service.js";
import type { JobContentService } from "../../src/jobs/content.types.js";
import { watchJobStream } from "../../src/jobs/stream.js";

it("an acquired stream preserves the caller's original pre-pull abort reason", async () => {
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
});

it("interruption during eager iterator transfer releases the acquired native prefix", async () => {
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
});

it("named content substitutes its complete service contract", async () => {
  const substitute: JobContentService = {
    open: async <Item extends JsonValue>() =>
      ({ async *[Symbol.asyncIterator]() {} }) as AsyncIterable<NamedStreamFrame<Item>>,
  };
  const collect = async (content: JobContentService, client: unknown) => {
    const result = [];
    for await (const frame of await content.open(client, "job", {
      runId: "run",
      name: "content",
    }))
      result.push(frame);
    return result;
  };
  expect(await collect(substitute, {})).toEqual([]);
  const end = {
    kind: "end",
    runId: "run",
    name: "content",
    attempt: 1,
    generation: "g",
    schemaVersion: "1",
  };
  const live = await collect(jobContent, {
    jobs: {
      job: {
        runs: {
          stream: async () => ({
            next: async () => ({ done: false, value: end }),
            return: async () => ({ done: true, value: undefined }),
          }),
        },
      },
    },
  });
  expect(live).toEqual([end]);
});
