import { expect, test } from "vitest";
import { defineError, defineFunction } from "@relkit/functions";
import { z } from "@relkit/schema";
import { Cause, Effect, Exit } from "effect";
import { bindDescriptorIdentity } from "@relkit/invocation";
import { defineTool, defineToolEffect, isToolDescriptor, isToolRef } from "../src/define-tool.js";
import { copyFunctionTarget } from "../src/define-tool-validation.js";
import { resolveToolTarget, resolveToolTargetEffect } from "../src/runtime.js";
import { isFunctionTarget, isRecord } from "../src/tool-predicates.js";
import { toolAttempt, ToolOperationFailure } from "../src/tool-observability.js";

const input = z.object({ id: z.string() });
const output = z.object({ id: z.string() });

test("optional descriptor IDs and declared errors survive target copying", () => {
  const unavailable = defineError({
    id: "orders.unavailable",
    data: z.object({}),
    message: "Unavailable",
  });
  const target = defineFunction({
    input,
    output,
    errors: [unavailable],
    handler: ({ id }) => ({ id }),
  });
  const tool = defineTool({
    target,
    description: "Read order",
    sideEffect: "read",
    approval: "never",
  });
  expect(tool.id).toBeDefined();
  expect(copyFunctionTarget(target).errors).toEqual([unavailable]);
  expect(resolveToolTarget(tool).errors).toEqual([unavailable]);
  expect(resolveToolTarget(tool).functionId).toBe(target.ref.id);
  bindDescriptorIdentity(tool.target, "orders.bound");
  expect(resolveToolTarget(tool).functionId).toBe("orders.bound");
});

test("descriptor validation rejects malformed candidate fields", () => {
  const target = defineFunction({
    id: "orders.check",
    input,
    output,
    handler: ({ id }) => ({ id }),
  });
  const tool = defineTool({
    id: "orders.check.tool",
    target,
    description: "Read",
    sideEffect: "read",
    approval: "never",
  });
  const candidate = (overrides: Record<string, unknown>) =>
    Object.defineProperty({ ...tool, ...overrides }, "invoke", {
      value: "invoke" in overrides ? overrides.invoke : tool.invoke,
    });
  expect(isToolDescriptor(candidate({}))).toBe(true);
  expect(isToolDescriptor(candidate({ handler: () => null }))).toBe(false);
  expect(isToolDescriptor(candidate({ target: {} }))).toBe(false);
  expect(isToolDescriptor(candidate({ invoke: null }))).toBe(false);
  expect(isToolDescriptor(candidate({ description: " " }))).toBe(false);
  expect(isToolDescriptor(candidate({ sideEffect: "unknown" }))).toBe(false);
  expect(isToolDescriptor(candidate({ approval: "unknown" }))).toBe(false);
  expect(isToolDescriptor(candidate({ mcp: "yes" }))).toBe(false);
  expect(isToolDescriptor(candidate({ timeoutMs: 0 }))).toBe(false);
  expect(isToolDescriptor(null)).toBe(false);
  expect(isToolRef(null)).toBe(false);
  expect(isRecord(null)).toBe(false);
  expect(isRecord([])).toBe(false);
  expect(isFunctionTarget(null)).toBe(false);
  expect(isFunctionTarget({ ref: target.ref })).toBe(false);
  expect(isFunctionTarget({ ...target, input: {} })).toBe(false);
  expect(isFunctionTarget({ ...target, output: { "~standard": {} } })).toBe(false);
  expect(isFunctionTarget({ ...target, handler: 1 })).toBe(false);
  expect(isFunctionTarget({ ...target, errors: "bad" })).toBe(false);
  expect(isFunctionTarget({ ...target, errors: [{}] })).toBe(false);
  expect(isFunctionTarget(target)).toBe(true);
});

test("malformed target resolution is typed and adapter preserves TypeError", () => {
  expect(() => resolveToolTarget({} as never)).toThrow("Invalid tool descriptor");
  const exit = Effect.runSyncExit(resolveToolTargetEffect({} as never));
  if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(ToolOperationFailure);
  else throw new Error("Expected failure");
  const target = defineFunction({
    id: "orders.typed",
    input,
    output,
    handler: ({ id }) => ({ id }),
  });
  const options = {
    id: "orders.typed.tool",
    target,
    description: "Read",
    sideEffect: "read" as const,
    approval: "never" as const,
  };
  expect(() => defineTool(null as never)).toThrow("Tool options must be an object");
  expect(() => defineTool({ ...options, id: "bad id" })).toThrow(TypeError);
  const invalid = Effect.runSyncExit(defineToolEffect({ ...options, id: "bad id" }));
  if (Exit.isFailure(invalid))
    expect(Cause.squash(invalid.cause)).toBeInstanceOf(ToolOperationFailure);
  else throw new Error("Expected failure");
});

test("unexpected defects remain defects in the Effect operation helper", () => {
  const cause = new Error("unexpected");
  const exit = Effect.runSyncExit(
    toolAttempt("define", () => {
      throw cause;
    }),
  );
  if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBe(cause);
  else throw new Error("Expected defect");
});
