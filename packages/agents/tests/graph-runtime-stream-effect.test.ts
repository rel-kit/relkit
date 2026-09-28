import { z } from "@relkit/schema";
import { Effect } from "effect";
import { expect, test, vi } from "vitest";
import { GRAPH_EXECUTION } from "../src/graph-execution-symbol.js";
import { streamCompiledGraphEffect } from "../src/graph-runtime-stream.js";

const signal = new AbortController().signal;
const options = {
  agent: {
    output: z.object({ answer: z.string() }),
    limits: { maxSteps: 2, maxToolCalls: 2 },
    [GRAPH_EXECUTION]: { state: {} },
  },
} as never;

function compiled(output: unknown, abort: () => void) {
  const run = {
    async *[Symbol.asyncIterator]() {},
    output: Promise.resolve(output),
    abort,
  };
  return { streamEvents: async () => run } as never;
}

test("compiled graph stream Effect returns validated output without aborting", async () => {
  const abort = vi.fn();
  const output = await Effect.runPromise(streamCompiledGraphEffect(
    options, compiled({ answer: "ready" }, abort), {}, {}, signal, 1024,
  ));
  expect(output).toEqual({ answer: "ready" });
  expect(abort).not.toHaveBeenCalled();
});

test("compiled graph stream Effect aborts its stream after output validation fails", async () => {
  const abort = vi.fn();
  const failure = await Effect.runPromise(Effect.flip(streamCompiledGraphEffect(
    options, compiled({ answer: 7 }, abort), {}, {}, signal, 1024,
  )));
  expect(failure).toMatchObject({ _tag: "GraphInvocationFailure" });
  expect(abort).toHaveBeenCalledTimes(1);
});

test("pre-aborted graph stream Effect does not start the native stream", async () => {
  const controller = new AbortController();
  controller.abort();
  const streamEvents = vi.fn();
  const failure = await Effect.runPromise(Effect.flip(streamCompiledGraphEffect(
    options, { streamEvents } as never, {}, {}, controller.signal, 1024,
  )));
  expect(failure).toMatchObject({ _tag: "GraphInvocationFailure" });
  expect(streamEvents).not.toHaveBeenCalled();
});
