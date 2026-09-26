import { expect, test } from "vitest";
import { defineError, defineFunction } from "@relkit/functions";
import { z } from "@relkit/schema";
import { Cause, Effect, Exit, Layer } from "effect";
import { defineTool } from "../src/define-tool.js";
import {
  createToolRuntime,
  invokeTool,
  invokeToolEffect,
  ToolArgumentsFailure,
  ToolCancelledFailure,
  ToolNotAllowedError,
} from "../src/runtime.js";
import { ToolEngineService } from "../src/runtime-engine.js";
import { validateToolArgumentsEffect } from "../src/runtime-input.js";

const target = defineFunction({
  id: "orders.edge",
  input: z.object({ id: z.string() }),
  output: z.object({ id: z.string() }),
  handler: ({ id }) => ({ id }),
});
const tool = defineTool({
  id: "orders.edge.tool",
  target,
  description: "Read order",
  sideEffect: "read",
  approval: "never",
});

test("runtime forwards optional context and uses a copied allowlist", async () => {
  const calls: unknown[] = [];
  const engine = {
    invoke: async (request: unknown) => {
      calls.push(request);
      return "ok";
    },
  };
  const allowedTools = [tool.id];
  const runtime = createToolRuntime({ tools: [tool], engine, allowedTools });
  allowedTools.splice(0);
  const controller = new AbortController();
  await expect(runtime.invoke(tool.id, { id: "one" }, { signal: controller.signal })).resolves.toBe(
    "ok",
  );
  const hooks = { marker: true };
  const parent = { marker: "parent" };
  await expect(
    invokeTool({ tools: [tool], engine, toolId: tool.id, arguments: { id: "two" }, hooks, parent }),
  ).resolves.toBe("ok");
  expect(calls).toMatchObject([
    { input: { id: "one" }, signal: controller.signal },
    { input: { id: "two" }, hooks, parent },
  ]);
});

test("allowlist accepts strings, descriptor references, and explicit ref objects", async () => {
  const engine = { invoke: async () => "ok" };
  for (const allowedTools of [[tool.id], [tool], [tool.ref], [{ ref: tool.ref }]]) {
    await expect(
      invokeTool({
        tools: [tool],
        engine,
        toolId: tool.id,
        arguments: { id: "one" },
        allowedTools,
      }),
    ).resolves.toBe("ok");
  }
  await expect(
    invokeTool({
      tools: [tool],
      engine,
      toolId: tool.id,
      arguments: {},
      allowedTools: ["orders.other"],
    }),
  ).rejects.toBeInstanceOf(ToolNotAllowedError);
  await expect(
    invokeTool({
      tools: new Map([[tool.id, tool]]),
      engine,
      toolId: tool.id,
      arguments: { id: "one" },
    }),
  ).resolves.toBe("ok");
  await expect(
    invokeTool({ tools: { [tool.id]: tool }, engine, toolId: tool.id, arguments: { id: "one" } }),
  ).resolves.toBe("ok");
});

test("abort during async validation prevents late engine dispatch", async () => {
  let starts = 0;
  const controller = new AbortController();
  const input = {
    "~standard": {
      version: 1 as const,
      vendor: "test",
      validate: async (value: unknown) => {
        controller.abort();
        return { value };
      },
    },
  };
  const slow = defineTool({
    id: "orders.slow.tool",
    target: { ref: { kind: "function", id: "orders.slow" }, input, output: target.output } as never,
    description: "Slow validation",
    sideEffect: "read",
    approval: "never",
  });
  const exit = await Effect.runPromiseExit(
    Effect.provide(
      invokeToolEffect({
        tools: [slow],
        toolId: slow.id,
        arguments: { id: "one" },
        signal: controller.signal,
      }),
      Layer.succeed(ToolEngineService, {
        invoke: async () => {
          starts++;
          return null;
        },
      }),
    ),
  );
  if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(ToolCancelledFailure);
  else throw new Error("Expected cancellation");
  expect(starts).toBe(0);
});

test("a schema rejection becomes a typed argument failure", async () => {
  const schema = {
    "~standard": {
      version: 1 as const,
      vendor: "test",
      validate: async () => {
        throw new Error("schema unavailable");
      },
    },
  };
  const exit = await Effect.runPromiseExit(validateToolArgumentsEffect(schema, {}));
  if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(ToolArgumentsFailure);
  else throw new Error("Expected validation failure");
});

test("declared target errors reach the engine invocation", async () => {
  const unavailable = defineError({
    id: "orders.unavailable",
    data: z.object({}),
    message: "Unavailable",
  });
  const withError = defineFunction({
    id: "orders.with-error",
    input: target.input,
    output: target.output,
    errors: [unavailable],
    handler: ({ id }) => ({ id }),
  });
  const candidate = defineTool({
    id: "orders.with-error.tool",
    target: withError,
    description: "Read order",
    sideEffect: "read",
    approval: "never",
  });
  let received: unknown;
  await invokeTool({
    tools: [candidate],
    engine: {
      invoke: async (request) => {
        received = request.errors;
        return null;
      },
    },
    toolId: candidate.id,
    arguments: { id: "one" },
  });
  expect(received).toEqual([unavailable]);
});
