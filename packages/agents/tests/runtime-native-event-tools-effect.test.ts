import { Effect } from "effect";
import { expect, test } from "vitest";
import { emitToolEvent, emitToolEventEffect } from "../src/runtime-native-event-tools.js";

const signal = new AbortController().signal;
const ids = new Map([["search", "tools.search"]]);
const names = new Map<string, string>();
const event = (kind: string, value?: unknown) =>
  ({
    method: "tools",
    params: {
      namespace: [],
      data: {
        event: kind,
        tool_call_id: "call-1",
        tool_name: "search",
        input: { query: "hello" },
        output: value,
      },
    },
  }) as never;

test("native tool event Effect preserves transition order and public ID", async () => {
  const emitted: unknown[] = [];
  const sink = {
    emitTool: (value: unknown) => {
      emitted.push(value);
    },
  } as never;
  await Effect.runPromise(
    emitToolEventEffect(event("tool-started"), sink, ids, new Set(), names, signal),
  );
  await emitToolEvent(event("tool-finished", { count: 1 }), sink, ids, new Set(), names, signal);
  expect(emitted).toEqual([
    { toolCallId: "call-1", toolId: "tools.search", state: "started" },
    {
      toolCallId: "call-1",
      toolId: "tools.search",
      state: "input-ready",
      value: { query: "hello" },
    },
    { toolCallId: "call-1", toolId: "tools.search", state: "running" },
    { toolCallId: "call-1", toolId: "tools.search", state: "succeeded", value: { count: 1 } },
  ]);
});

test("native tool event Effect tags sink failure", async () => {
  const sink = {
    emitTool: () => {
      throw new Error("sink unavailable");
    },
  } as never;
  const failure = await Effect.runPromise(
    Effect.flip(emitToolEventEffect(event("tool-started"), sink, ids, new Set(), names, signal)),
  );
  expect(failure).toMatchObject({ _tag: "AgentInvocationFailure" });
});

test("a successful tool may return its own error-shaped data", async () => {
  const emitted: Array<{ state: string }> = [];
  const sink = {
    emitTool: (value: { state: string }) => {
      emitted.push(value);
    },
  } as never;
  await Effect.runPromise(
    emitToolEventEffect(
      event("tool-finished", { error: { code: "DOMAIN_MISSING" } }),
      sink,
      ids,
      new Set(),
      names,
      signal,
    ),
  );
  expect(emitted.map(({ state }) => state)).toEqual(["succeeded"]);
});
