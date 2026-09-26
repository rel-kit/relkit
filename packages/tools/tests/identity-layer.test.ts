import { expect, test } from "vitest";
import { defineFunction } from "@relkit/functions";
import { bindDescriptorIdentityEffect, IdentityStore } from "@relkit/invocation";
import { z } from "@relkit/schema";
import { Effect, Layer } from "effect";
import { defineTool, defineToolEffect } from "../src/define-tool.js";
import { copyFunctionTargetEffect } from "../src/define-tool-validation.js";
import { ToolEngineService } from "../src/runtime-engine.js";
import { findToolEffect } from "../src/runtime-resolution.js";
import {
  invokeToolEffect,
  resolveToolTargetEffect,
  ToolNotAllowedFailure,
} from "../src/runtime.js";
import { ToolOperationFailure } from "../src/tool-observability.js";

function isolatedIdentityStore(nextUnboundId?: () => string) {
  let nextId = 0;
  return Layer.succeed(IdentityStore, {
    canonical: new WeakMap<object, string>(),
    unbound: new WeakMap<object, string>(),
    services: new WeakMap<object, object & { readonly id?: unknown }>(),
    nextUnboundId: nextUnboundId ?? (() => String(++nextId)),
  });
}

const input = z.object({ id: z.string() });
const output = z.object({ id: z.string() });

test("Effect authoring uses injected target bindings and ID generation", () => {
  const identity = isolatedIdentityStore();
  const target = defineFunction({ input, output, handler: ({ id }) => ({ id }) });
  Effect.runSync(
    Effect.provide(bindDescriptorIdentityEffect(target, "orders.bound-target"), identity),
  );

  const tool = Effect.runSync(
    Effect.provide(
      defineToolEffect({
        target,
        description: "Read order",
        sideEffect: "read",
        approval: "never",
      }),
      identity,
    ),
  );

  expect(tool.target.ref.id).toBe("orders.bound-target");
  expect(tool.id).toBe("unbound.1");
});

test("Effect target resolution uses the injected binding", () => {
  const identity = isolatedIdentityStore();
  const target = defineFunction({ input, output, handler: ({ id }) => ({ id }) });
  const tool = defineTool({
    target,
    description: "Read order",
    sideEffect: "read",
    approval: "never",
  });
  Effect.runSync(
    Effect.provide(bindDescriptorIdentityEffect(tool.target, "orders.resolved-target"), identity),
  );

  const resolved = Effect.runSync(Effect.provide(resolveToolTargetEffect(tool), identity));
  expect(resolved.functionId).toBe("orders.resolved-target");
});

test("Effect invocation finds tools bound in an injected store", async () => {
  const identity = isolatedIdentityStore();
  const target = defineFunction({
    id: "orders.lookup",
    input,
    output,
    handler: ({ id }) => ({ id }),
  });
  const tool = defineTool({
    target,
    description: "Read order",
    sideEffect: "read",
    approval: "never",
  });
  Effect.runSync(Effect.provide(bindDescriptorIdentityEffect(tool, "orders.bound-tool"), identity));
  const seen: string[] = [];
  const engine = Layer.succeed(ToolEngineService, {
    invoke: async ({ functionId }: { readonly functionId: string }) => {
      seen.push(functionId);
      return "ok";
    },
  });
  const layer = Layer.mergeAll(identity, engine);
  const sources = [[tool], new Map([["alias", tool]]), { alias: tool }] as const;

  for (const tools of sources) {
    const result = await Effect.runPromise(
      Effect.provide(
        invokeToolEffect({
          tools,
          toolId: "orders.bound-tool",
          arguments: { id: "one" },
          allowedTools: [tool],
        }),
        layer,
      ),
    );
    expect(result).toBe("ok");
  }
  expect(seen).toEqual(["orders.lookup", "orders.lookup", "orders.lookup"]);

  const denied = await Effect.runPromise(
    Effect.flip(
      Effect.provide(
        invokeToolEffect({
          tools: [tool],
          toolId: "orders.bound-tool",
          arguments: { id: "one" },
          allowedTools: [{ ref: tool.ref }],
        }),
        layer,
      ),
    ),
  );
  expect(denied).toBeInstanceOf(ToolNotAllowedFailure);
});

test("identity failures remain tagged while preserving their original cause", async () => {
  const target = defineFunction({
    id: "orders.lookup",
    input,
    output,
    handler: ({ id }) => ({ id }),
  });
  const invalidTarget = { ...target, id: "bad id" };
  const copyFailure = Effect.runSync(Effect.flip(copyFunctionTargetEffect(invalidTarget)));
  expect(copyFailure).toBeInstanceOf(ToolOperationFailure);
  expect(copyFailure.cause).toBeInstanceOf(TypeError);

  const failingIdentity = isolatedIdentityStore(() => {
    throw new TypeError("ID source failed");
  });
  const defineFailure = Effect.runSync(
    Effect.flip(
      Effect.provide(
        defineToolEffect({
          target,
          description: "Read order",
          sideEffect: "read",
          approval: "never",
        }),
        failingIdentity,
      ),
    ),
  );
  expect(defineFailure).toBeInstanceOf(ToolOperationFailure);
  expect(defineFailure.cause).toBeInstanceOf(TypeError);

  const tool = defineTool({
    id: "orders.lookup.tool",
    target,
    description: "Read order",
    sideEffect: "read",
    approval: "never",
  });
  const invalidTool = Object.defineProperty(
    { ...tool, target: { ...tool.target, id: "bad id" } },
    "invoke",
    { value: tool.invoke },
  );
  const resolveFailure = Effect.runSync(Effect.flip(resolveToolTargetEffect(invalidTool)));
  expect(resolveFailure).toBeInstanceOf(ToolOperationFailure);
  expect(resolveFailure.cause).toBeInstanceOf(TypeError);

  const lookupFailure = Effect.runSync(
    Effect.flip(findToolEffect([{ ...tool, id: "bad id" }], tool.id)),
  );
  expect(lookupFailure).toBeInstanceOf(ToolOperationFailure);
  expect(lookupFailure.cause).toBeInstanceOf(TypeError);

  const engine = Layer.succeed(ToolEngineService, { invoke: async () => "unexpected" });
  const invokeFailure = await Effect.runPromise(
    Effect.flip(
      Effect.provide(
        invokeToolEffect({
          tools: { [tool.id]: { ...tool, id: "bad id" } },
          toolId: tool.id,
          arguments: { id: "one" },
        }),
        engine,
      ),
    ),
  );
  expect(invokeFailure).toBeInstanceOf(ToolOperationFailure);
  expect(invokeFailure.cause).toBeInstanceOf(TypeError);
});

test("missing map and record entries return unknown-tool failures", async () => {
  const target = defineFunction({
    id: "orders.lookup",
    input,
    output,
    handler: ({ id }) => ({ id }),
  });
  const tool = defineTool({
    id: "orders.lookup.tool",
    target,
    description: "Read order",
    sideEffect: "read",
    approval: "never",
  });
  for (const tools of [new Map([["alias", tool]]), { alias: tool }]) {
    const found = Effect.runSync(findToolEffect(tools, "orders.missing"));
    expect(found).toBeUndefined();
  }
});
