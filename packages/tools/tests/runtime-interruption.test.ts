import { expect, test } from "vitest";
import { defineFunction } from "@relkit/functions";
import { z } from "@relkit/schema";
import { Effect, Fiber, Layer } from "effect";
import { defineTool } from "../src/define-tool.js";
import { ToolEngineService } from "../src/runtime-engine.js";
import { invokeToolEffect } from "../src/runtime.js";
import type { ToolEngineInvocation } from "../src/runtime.types.js";

const target = defineFunction({
  id: "orders.interrupt",
  input: z.object({ id: z.string() }),
  output: z.object({ id: z.string() }),
  handler: ({ id }) => ({ id }),
});
const tool = defineTool({
  id: "orders.interrupt.tool",
  target,
  description: "Read order",
  sideEffect: "read",
  approval: "never",
});

test("interrupting the exported Effect releases an active engine invocation", async () => {
  const caller = new AbortController();
  const { promise: engineStarted, resolve: started } = Promise.withResolvers<void>();
  let receivedSignal: AbortSignal | undefined;
  let released = false;
  const engine = {
    invoke: ({ signal }: ToolEngineInvocation) => {
      receivedSignal = signal;
      started();
      return new Promise<void>((resolve) => {
        signal?.addEventListener(
          "abort",
          () => {
            released = true;
            resolve();
          },
          { once: true },
        );
      });
    },
  };
  const fiber = Effect.runFork(
    Effect.provide(
      invokeToolEffect({
        tools: [tool],
        toolId: tool.id,
        arguments: { id: "one" },
        signal: caller.signal,
      }),
      Layer.succeed(ToolEngineService, engine),
    ),
  );
  await engineStarted;
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(receivedSignal?.aborted).toBe(true);
  expect(released).toBe(true);
  expect(caller.signal.aborted).toBe(false);
});
