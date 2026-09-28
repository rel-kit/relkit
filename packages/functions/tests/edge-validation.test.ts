import { expect, test } from "vitest";
import { z } from "@relkit/schema";
import { Cause, Effect, Exit } from "effect";
import { assertErrorSchema, isErrorDescriptor } from "../src/define-error-validation.js";
import { defineError } from "../src/define-error.js";
import {
  assertSchema,
  functionTargetForReceiver,
  validateLimitEffect,
} from "../src/define-function-validation.js";
import { defineFunction, defineFunctionEffect } from "../src/define-function.js";
import {
  FunctionOperationError,
  runFunctionPromise,
  runFunctionSync,
} from "../src/function-observability.js";
import { createFunctionTool } from "../src/function-tool.js";
import { isFunctionTarget } from "../src/function-tool-shape.js";

test("schema and message validation reject malformed runtime values", () => {
  expect(() => assertErrorSchema({ "~standard": { version: 1 } })).toThrow(
    "Declared error data must be a Standard Schema v1 validator",
  );
  expect(() => assertSchema({ "~standard": { version: 1 } }, "input")).toThrow(
    "input must be a Standard Schema v1 validator",
  );
  const BrokenMessage = defineError({
    id: "orders.broken",
    data: z.object({ id: z.string() }),
    message: (() => 1) as never,
  });
  expect(() => BrokenMessage.create({ id: "one" })).toThrow("must be a string");
});

test("receiver selection enforces callable targets and preserves a fallback", () => {
  const fn = defineFunction({
    id: "orders.lookup",
    input: z.object({ id: z.string() }),
    output: z.object({ id: z.string() }),
    handler: ({ id }) => ({ id }),
  });
  expect(functionTargetForReceiver(null, fn)).toBe(fn);
  expect(functionTargetForReceiver(fn, fn)).toBe(fn);
  expect(() => functionTargetForReceiver({ invocationMode: "event-only" }, fn)).toThrow(
    "Event-only functions cannot be invoked or converted to tools",
  );
});

test("tool guards reject malformed callable and error shapes", () => {
  const NotFound = defineError({
    id: "orders.not-found",
    data: z.object({ id: z.string() }),
    message: "Missing",
  });
  const fn = defineFunction({
    id: "orders.lookup",
    input: z.object({ id: z.string() }),
    output: z.object({ id: z.string() }),
    errors: [NotFound],
    handler: ({ id }) => ({ id }),
  });
  expect(isErrorDescriptor(NotFound)).toBe(true);
  expect(isErrorDescriptor({ ...NotFound, ref: { kind: "error", id: "wrong" } })).toBe(false);
  expect(isFunctionTarget({ ...fn, input: null })).toBe(false);
  expect(isFunctionTarget({ ...fn, handler: 1 })).toBe(false);
  expect(isFunctionTarget({ ...fn, invoke: 1 })).toBe(false);
  expect(isFunctionTarget({ ...fn, errors: [{}] })).toBe(false);
  const tool = createFunctionTool({
    id: "orders.lookup-tool",
    target: fn,
    description: "Lookup order",
    sideEffect: "read",
    approval: "never",
  });
  expect(tool.mcp).toBe(true);
  expect(tool.target.errors).toEqual([NotFound]);
  expect(Object.isFrozen(tool.target.errors)).toBe(true);
});

test("compatibility runners propagate unexpected defects", async () => {
  expect(() => runFunctionSync(Effect.die(new Error("sync defect")))).toThrow("sync defect");
  await expect(runFunctionPromise(Effect.die(new Error("async defect")))).rejects.toThrow(
    "async defect",
  );
});

test("expected validation is tagged while an unexpected getter remains a defect", () => {
  const reason = Effect.runSync(
    validateLimitEffect(0, "timeoutMs").pipe(
      Effect.catchTag("FunctionOperationError", (failure) => Effect.succeed(failure.reason)),
    ),
  );
  expect(reason).toBe("timeoutMs must be a positive integer");

  const options = {
    get id() {
      throw new Error("unexpected getter defect");
    },
  };
  const exit = Effect.runSyncExit(defineFunctionEffect(options as never));
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    const failure = Cause.squash(exit.cause);
    expect(failure).toEqual(new Error("unexpected getter defect"));
    expect(failure).not.toBeInstanceOf(FunctionOperationError);
  }
});
