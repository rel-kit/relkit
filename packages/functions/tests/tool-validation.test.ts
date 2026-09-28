import { describe, expect, test } from "vitest";
import { z } from "@relkit/schema";
import { Cause, Effect, Exit, Layer } from "effect";
import { defineFunction } from "../src/define-function.js";
import { createFunctionTool, copyFunctionToolMetadata } from "../src/function-tool.js";
import {
  copyFunctionToolHooks,
  isFunctionTarget,
  isErrorDescriptor,
  validateSideEffect,
  validateApproval,
  requiredText,
  positiveInteger,
} from "../src/function-tool-validation.js";
import {
  FunctionOperationError,
  FunctionTelemetry,
  type FunctionOperation,
} from "../src/function-observability.js";
import { copyFunctionToolMetadataEffect } from "../src/function-tool.js";

const target = defineFunction({
  id: "orders.lookup",
  input: z.object({ id: z.string() }),
  output: z.object({ id: z.string() }),
  handler: ({ id }) => ({ id }),
});

describe("tool metadata validation", () => {
  test("normalizes safe metadata and hooks", () => {
    const metadata = copyFunctionToolMetadata({
      title: "Lookup",
      description: " Lookup order ",
      sideEffect: "read",
      approval: "on-write",
      timeoutMs: 5,
      mcp: false,
      tags: ["orders"],
    });
    expect(metadata).toMatchObject({
      description: "Lookup order",
      sideEffect: "read",
      approval: "on-write",
      timeoutMs: 5,
      mcp: false,
    });
    expect(Object.isFrozen(metadata.tags)).toBe(true);
    expect(copyFunctionToolHooks({ onBefore: (value: unknown) => value })).toHaveProperty(
      "onBefore",
    );
    expect(isFunctionTarget(target)).toBe(true);
    expect(isErrorDescriptor({ kind: "error", id: "invalid" })).toBe(false);
  });

  test("preserves adapter errors for malformed fields", () => {
    expect(() => validateSideEffect("delete")).toThrow("Tool sideEffect must be");
    expect(() => validateApproval("sometimes")).toThrow("Tool approval must be");
    expect(() => requiredText("  ", "Tool description")).toThrow("Tool description is required");
    expect(() => positiveInteger(0, "timeoutMs")).toThrow("timeoutMs must be a positive integer");
    expect(() => copyFunctionToolMetadata({})).toThrow("Tool description is required");
    expect(() =>
      copyFunctionToolMetadata({
        description: "ok",
        sideEffect: "read",
        approval: "never",
        mcp: "yes",
      }),
    ).toThrow("Tool mcp must be a boolean");
    expect(() =>
      copyFunctionToolMetadata({
        description: "ok",
        sideEffect: "read",
        approval: "never",
        tags: [1],
      }),
    ).toThrow("Tool tags must be an array of strings");
    expect(() =>
      copyFunctionToolMetadata({
        description: "ok",
        sideEffect: "read",
        approval: "never",
        title: 1,
      }),
    ).toThrow("Tool title must be a string");
    expect(() => copyFunctionToolHooks({ onAfter: true })).toThrow(
      "Tool onAfter must be a function",
    );
  });

  test("rejects handlers and invalid targets when creating a tool", () => {
    const base = {
      id: "orders.tool",
      target,
      description: "Lookup",
      sideEffect: "read" as const,
      approval: "never" as const,
    };
    expect(() => createFunctionTool({ ...base, handler: () => {} } as never)).toThrow(
      "Tools cannot own handlers",
    );
    expect(() => createFunctionTool({ ...base, target: {} as never })).toThrow(
      "Tool target must be a function reference",
    );
    expect(() => createFunctionTool({ ...base, onBefore: 1 as never })).toThrow(
      "Tool onBefore must be a function",
    );
    expect(isFunctionTarget({ ...target, invocationMode: "event-only" })).toBe(false);
  });

  test("uses a test telemetry Layer for success and typed failure", async () => {
    const operations: FunctionOperation[] = [];
    const testLayer = Layer.succeed(FunctionTelemetry, {
      observe: (operation, effect) => {
        operations.push(operation);
        return effect;
      },
    });
    const success = await Effect.runPromise(
      Effect.provide(
        copyFunctionToolMetadataEffect({
          description: "Lookup",
          sideEffect: "read",
          approval: "never",
        }),
        testLayer,
      ),
    );
    expect(success.description).toBe("Lookup");
    const failure = await Effect.runPromiseExit(
      Effect.provide(copyFunctionToolMetadataEffect({}), testLayer),
    );
    expect(Exit.isFailure(failure)).toBe(true);
    if (Exit.isFailure(failure))
      expect(Cause.squash(failure.cause)).toBeInstanceOf(FunctionOperationError);
    expect(operations).toEqual(["tool.copy-metadata", "tool.copy-metadata"]);
  });
});
