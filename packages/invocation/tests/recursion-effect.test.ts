import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import {
  RecursionFailure,
  createInvocationChain,
  createInvocationChainEffect,
  createInvocationCallStack,
  createInvocationCallStackEffect,
} from "../src/index.js";

describe("Effect recursion policy", () => {
  test("creates independent immutable paths and exposes membership", () => {
    const root = Effect.runSync(createInvocationCallStackEffect());
    const child = Effect.runSync(root.enterEffect("tasks.run", "invocation-1"));
    expect(root.frames).toHaveLength(0);
    expect(Effect.runSync(child.functionIdsEffect())).toEqual(["tasks.run"]);
    expect(Effect.runSync(child.hasEffect("tasks.run"))).toBe(true);
    expect(Effect.runSync(root.hasEffect("tasks.run"))).toBe(false);
  });

  test("tags a cycle with the same public cause", () => {
    const stack = createInvocationCallStack().enter("tasks.run");
    const failure = Effect.runSync(Effect.catchTag(
      stack.enterEffect("tasks.run"),
      "RecursionFailure",
      (error) => Effect.succeed(error),
    ));
    expect(failure).toBeInstanceOf(RecursionFailure);
    expect(failure.cause).toMatchObject({
      code: "RELKIT_RECURSION_DENIED",
      callStack: ["tasks.run"],
      cycle: ["tasks.run", "tasks.run"],
    });
    expect(() => stack.enter("tasks.run")).toThrow(failure.cause.constructor);
  });

  test("rejects malformed initial frames", () => {
    const failure = Effect.runSync(Effect.catchTag(
      createInvocationCallStackEffect([{ functionId: "" }]),
      "RecursionFailure",
      (error) => Effect.succeed(error),
    ));
    expect(failure.cause).toBeInstanceOf(TypeError);
    expect(() => createInvocationCallStack([{ functionId: "" }])).toThrow(TypeError);
  });

  test("supports frame and descriptor adapters across immutable paths", () => {
    const root = createInvocationChain();
    const frame = root.enter({ functionId: "tasks.run" });
    expect(frame.has("tasks.run")).toBe(true);
    const descriptor = {};
    const target = Effect.runSync(root.enterTargetEffect(descriptor));
    expect(target.frames).toHaveLength(1);
    expect(root.enterTarget(descriptor).frames).toHaveLength(1);
    expect(Effect.runSync(createInvocationChainEffect()).frames).toHaveLength(0);
  });
});
