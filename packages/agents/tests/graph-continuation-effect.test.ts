import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import { z, type StandardSchemaV1 } from "@relkit/schema";
import { defineGraphNode } from "../src/define-graph-node.js";
import type { GraphDescriptor } from "../src/define-graph.js";
import { GRAPH_EXECUTION } from "../src/graph-execution-symbol.js";
import {
  graphConfig,
  graphConfigEffect,
  resumeCommandEffect,
  validateGraphResumeInput,
  validateGraphResumeInputEffect,
} from "../src/graph-continuation.js";

test("continuation Effect validates a large reply batch with bounded concurrency and order", async () => {
  let active = 0;
  let peak = 0;
  const resume: StandardSchemaV1 = {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: async (value) => {
        active += 1;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active -= 1;
        return { value };
      },
    },
  };
  const node = defineGraphNode({
    id: "worker",
    input: z.number(),
    output: z.number(),
    resume,
    handler: ({}) => 1,
  });
  const descriptor = { nodes: [node] } as unknown as GraphDescriptor;
  const requests = Array.from({ length: 40 }, () => ({ node: "worker", response: null }));
  const replies = Array.from({ length: 40 }, (_, index) => index);
  const validated = await Effect.runPromise(
    validateGraphResumeInputEffect(descriptor, requests, replies),
  );
  expect(validated).toEqual(replies);
  expect(peak).toBe(8);
});

test("continuation Effect tags invalid reply shapes and adapter retains TypeError", async () => {
  const descriptor = { nodes: [] } as unknown as GraphDescriptor;
  const result = await Effect.runPromise(
    Effect.result(validateGraphResumeInputEffect(descriptor, [], "reply")),
  );
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) expect(result.failure._tag).toBe("GraphContinuationFailure");
  await expect(validateGraphResumeInput(descriptor, [], "reply")).rejects.toThrow(TypeError);
});

test("graph configuration Effect enforces thread identity for persistent graphs", () => {
  const persistent = { [GRAPH_EXECUTION]: { checkpointer: {} } } as never;
  expect(Effect.runSync(graphConfigEffect(persistent, "thread-1"))).toEqual({
    configurable: { thread_id: "thread-1" },
  });
  expect(graphConfig(persistent, "thread-2")).toEqual({ configurable: { thread_id: "thread-2" } });
  expect(Effect.runSync(Effect.flip(graphConfigEffect(persistent)))).toMatchObject({
    _tag: "GraphContinuationFailure",
  });
  expect(() => graphConfig(persistent)).toThrow("requires threadId");
  expect(Effect.runSync(graphConfigEffect({ [GRAPH_EXECUTION]: {} } as never))).toEqual({});
});

test("resume command Effect rejects a graph without persistence", async () => {
  const descriptor = { [GRAPH_EXECUTION]: {} } as never;
  const failure = await Effect.runPromise(
    Effect.flip(resumeCommandEffect({} as never, descriptor, {}, { approved: true })),
  );
  expect(failure).toMatchObject({ _tag: "GraphContinuationFailure" });
});
