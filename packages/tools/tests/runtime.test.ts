import { describe, expect, test } from "vitest";
import { defineFunction } from "@relkit/functions";
import { z } from "@relkit/schema";
import { Cause, Effect, Exit, Layer } from "effect";
import { defineTool } from "../src/define-tool.js";
import {
  createToolRuntime,
  createToolRuntimeEffect,
  invokeTool,
  invokeToolEffect,
  resolveToolTarget,
  resolveToolTargetEffect,
  ToolArgumentValidationError,
  ToolArgumentsFailure,
  ToolCancelledFailure,
  ToolEngineFailure,
  ToolNotAllowedError,
  ToolNotAllowedFailure,
  ToolOperationCancelledError,
  ToolUnknownError,
  ToolUnknownFailure,
} from "../src/runtime.js";
import { ToolEngineLiveEffect, ToolEngineService } from "../src/runtime-engine.js";
import type { ToolEngineInvocation } from "../src/runtime.types.js";

const target = defineFunction({
  id: "orders.lookup",
  input: z.object({ id: z.string() }),
  output: z.object({ id: z.string() }),
  handler: ({ id }) => ({ id }),
});
const tool = defineTool({
  id: "orders.lookup.tool",
  target,
  description: "Read order",
  sideEffect: "read",
  approval: "never",
  timeoutMs: 50,
});
const request = { tools: [tool], toolId: tool.id, arguments: '{"id":"one"}' };

function failureOf(effect: Effect.Effect<unknown, unknown, ToolEngineService>) {
  return Effect.runPromiseExit(
    Effect.provide(
      effect,
      Layer.succeed(ToolEngineService, {
        invoke: async () => ({ ok: true }),
      }),
    ),
  );
}

describe("tool runtime", () => {
  test("resolves target and dispatches through a replaceable engine Layer", async () => {
    const seen: ToolEngineInvocation[] = [];
    const layer = Layer.succeed(ToolEngineService, {
      invoke: async (options) => {
        seen.push(options);
        return { ok: true };
      },
    });
    const result = await Effect.runPromise(Effect.provide(invokeToolEffect(request), layer));
    expect(Effect.runSync(ToolEngineLiveEffect({ invoke: async () => null }))).toBeDefined();
    expect(result).toEqual({ ok: true });
    expect(seen).toMatchObject([
      { functionId: "orders.lookup", input: { id: "one" }, source: "tool", timeoutMs: 50 },
    ]);
    expect(resolveToolTarget(tool).functionId).toBe("orders.lookup");
    expect(Effect.runSync(resolveToolTargetEffect(tool)).input).toBe(target.input);
    expect(Object.isFrozen(resolveToolTarget(tool))).toBe(true);
  });

  test("Promise adapters support array, map, and record sources", async () => {
    const seen: unknown[] = [];
    const engine = {
      invoke: async (options: ToolEngineInvocation) => {
        seen.push(options.input);
        return options.input;
      },
    };
    await expect(invokeTool({ ...request, engine })).resolves.toEqual({ id: "one" });
    await expect(
      invokeTool({ ...request, tools: new Map([["alias", tool]]), engine }),
    ).resolves.toEqual({ id: "one" });
    await expect(invokeTool({ ...request, tools: { alias: tool }, engine })).resolves.toEqual({
      id: "one",
    });
    expect(seen).toHaveLength(3);
    const runtime = createToolRuntime({ tools: [tool], engine, allowedTools: [tool.id] });
    expect(Object.isFrozen(runtime)).toBe(true);
    await expect(runtime.invoke(tool.id, { id: "two" })).resolves.toEqual({ id: "two" });
    const fromEffect = Effect.runSync(createToolRuntimeEffect({ tools: [tool], engine }));
    await expect(fromEffect.invoke(tool.id, { id: "three" })).resolves.toEqual({ id: "three" });
  });

  test("unknown and excluded tools fail with stable tags and adapter errors", async () => {
    const engine = { invoke: async () => null };
    await expect(
      invokeTool({ ...request, toolId: "orders.missing", engine }),
    ).rejects.toBeInstanceOf(ToolUnknownError);
    await expect(invokeTool({ ...request, allowedTools: [], engine })).rejects.toBeInstanceOf(
      ToolNotAllowedError,
    );
    for (const [effect, type] of [
      [invokeToolEffect({ ...request, toolId: "orders.missing" }), ToolUnknownFailure],
      [invokeToolEffect({ ...request, allowedTools: [] }), ToolNotAllowedFailure],
    ] as const) {
      const exit = await failureOf(effect);
      if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(type);
      else throw new Error("Expected a failure");
    }
  });

  test("invalid JSON and schema values fail before dispatch", async () => {
    let calls = 0;
    const engine = {
      invoke: async () => {
        calls++;
        return null;
      },
    };
    for (const arguments_ of ["{", { id: 1 }]) {
      await expect(
        invokeTool({ ...request, arguments: arguments_, engine }),
      ).rejects.toBeInstanceOf(ToolArgumentValidationError);
      const exit = await failureOf(invokeToolEffect({ ...request, arguments: arguments_ }));
      if (Exit.isFailure(exit))
        expect(Cause.squash(exit.cause)).toBeInstanceOf(ToolArgumentsFailure);
      else throw new Error("Expected a failure");
    }
    expect(calls).toBe(0);
  });

  test("aborted invocation never starts the engine", async () => {
    let calls = 0;
    const controller = new AbortController();
    controller.abort();
    const engine = {
      invoke: async () => {
        calls++;
        return null;
      },
    };
    await expect(
      invokeTool({ ...request, signal: controller.signal, engine }),
    ).rejects.toBeInstanceOf(ToolOperationCancelledError);
    const exit = await failureOf(invokeToolEffect({ ...request, signal: controller.signal }));
    if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(ToolCancelledFailure);
    else throw new Error("Expected a failure");
    expect(calls).toBe(0);
  });

  test("engine failures stay typed in Effect and preserve the original rejection", async () => {
    const cause = new Error("engine down");
    const engine = {
      invoke: async () => {
        throw cause;
      },
    };
    await expect(invokeTool({ ...request, engine })).rejects.toBe(cause);
    const exit = await Effect.runPromiseExit(
      Effect.provide(invokeToolEffect(request), Layer.succeed(ToolEngineService, engine)),
    );
    if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(ToolEngineFailure);
    else throw new Error("Expected a failure");
  });
});
