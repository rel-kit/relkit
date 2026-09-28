import { Effect } from "effect";
import { expect, test } from "vitest";
import { defineFunction } from "@relkit/functions";
import { z } from "@relkit/schema";
import { defineTool } from "@relkit/tools";
import { invokeAgentTool, invokeAgentToolEffect } from "../src/runtime-tool-adapter.js";

const target = defineFunction({
  id: "orders.lookup",
  input: z.object({ id: z.string() }),
  output: z.object({ state: z.string() }),
  handler: async ({ id }) => ({ state: id }),
});
const tool = defineTool({
  id: "orders.lookup.tool",
  target,
  description: "Look up an order",
  sideEffect: "read",
  approval: "never",
});
const turn = { callId: "call-1", toolId: tool.id, input: { id: "known" } };
const signal = new AbortController().signal;

test("tool adapter Effect and Promise adapter invoke the scoped engine", async () => {
  const calls: unknown[] = [];
  const engine = {
    invoke: async (request: unknown) => {
      calls.push(request);
      return { state: "ready" };
    },
  } as never;
  const options = {} as never;
  expect(
    await Effect.runPromise(invokeAgentToolEffect(engine, tool, turn, options, signal, "run-1")),
  ).toEqual({ state: "ready" });
  expect(await invokeAgentTool(engine, tool, turn, options, signal, "run-2")).toEqual({
    state: "ready",
  });
  expect(calls).toHaveLength(2);
});

test("tool adapter Effect reports invalid input as a typed failure", async () => {
  const engine = { invoke: async () => ({ state: "unused" }) } as never;
  const failure = await Effect.runPromise(
    Effect.flip(
      invokeAgentToolEffect(
        engine,
        tool,
        { ...turn, input: { id: 7 } },
        {} as never,
        signal,
        "run-1",
      ),
    ),
  );
  expect(failure).toMatchObject({
    _tag: "AgentInvocationFailure",
    cause: { code: "RELKIT_AGENT_INPUT_VALIDATION" },
  });
});

test("interrupting the exported tool Effect aborts the active engine call", async () => {
  const controller = new AbortController();
  let notify!: () => void;
  const started = new Promise<void>((resolve) => {
    notify = resolve;
  });
  let aborted = false;
  const engine = {
    invoke: (request: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        request.signal.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(request.signal.reason);
          },
          { once: true },
        );
        notify();
      }),
  } as never;
  const running = Effect.runPromise(
    invokeAgentToolEffect(engine, tool, turn, {} as never, controller.signal, "run-1"),
    { signal: controller.signal },
  );
  await started;
  controller.abort();
  await expect(running).rejects.toBeDefined();
  expect(aborted).toBe(true);
});

test("pre-aborted tool Effect never starts the engine", async () => {
  const controller = new AbortController();
  controller.abort();
  let starts = 0;
  const engine = {
    invoke: async () => {
      starts += 1;
      return { state: "late" };
    },
  } as never;
  const failure = await Effect.runPromise(
    Effect.flip(invokeAgentToolEffect(engine, tool, turn, {} as never, controller.signal, "run-1")),
  );
  expect(failure).toMatchObject({ _tag: "AgentInvocationFailure" });
  expect(starts).toBe(0);
});
