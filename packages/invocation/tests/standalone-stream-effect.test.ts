import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import { z } from "@relkit/schema";
import { createInvocationCallStack, createStandaloneDispatcher } from "../src/index.js";
import { createStandaloneStream, createStandaloneStreamEffect } from "../src/standalone-stream.js";

function options(source: AsyncIterable<unknown>, finish: (outcome: string) => Promise<void>) {
  return {
    source,
    schema: z.number(),
    controller: new AbortController(),
    dispatcher: createStandaloneDispatcher(),
    parent: { id: "invocation-1", traceId: "trace-1" },
    chain: createInvocationCallStack(),
    finish,
  };
}

describe("standalone deferred stream", () => {
  test("validates items and finalizes after consumption through Effect", async () => {
    const outcomes: string[] = [];
    async function* source() { yield 1; yield 2; }
    const stream = Effect.runSync(createStandaloneStreamEffect<AsyncIterable<number>>(
      options(source(), async (outcome) => { outcomes.push(outcome); }),
    ));
    const values: number[] = [];
    for await (const value of stream) values.push(value);
    expect(values).toEqual([1, 2]);
    expect(outcomes).toEqual(["success"]);
  });

  test("public adapter settles an invalid item as a failure", async () => {
    const outcomes: string[] = [];
    async function* source() { yield "invalid"; }
    const stream = createStandaloneStream<AsyncIterable<number>>(
      options(source(), async (outcome) => { outcomes.push(outcome); }),
    );
    await expect(stream[Symbol.asyncIterator]().next()).rejects.toBeDefined();
    expect(outcomes).toEqual(["defect"]);
  });
});
