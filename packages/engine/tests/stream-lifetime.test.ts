import { z } from "@relkit/schema";
import { expect, test } from "vitest";
import type { InvocationTarget } from "../src/invoke-types.js";
import { invoke } from "../src/invoke.js";

test("stream ownership lasts through consumer return and closes exactly once", async () => {
  const events: string[] = [];
  const output = { ...z.unknown(), kind: "stream", item: z.number() };
  const target: InvocationTarget<unknown, AsyncIterable<number>> = {
    id: "reports.stream",
    input: z.unknown(),
    output,
    handler: async function* () {
      events.push("handler");
      try {
        yield 1;
        yield 2;
      } finally {
        events.push("iterator closed");
      }
    },
  };
  const stream = await invoke({
    target,
    input: null,
    admit: () => {
      events.push("admitted");
      return {
        release: () => {
          events.push("released");
        },
      };
    },
    hooks: {
      onCompletion: () => {
        events.push("completed");
      },
    },
  });
  expect(events).toEqual([]);
  const iterator = stream[Symbol.asyncIterator]();
  expect(await iterator.next()).toEqual({ value: 1, done: false });
  expect(events).toEqual(["admitted", "handler"]);
  await iterator.return?.();
  await iterator.return?.();
  expect(events).toEqual(["admitted", "handler", "iterator closed", "completed", "released"]);
});
