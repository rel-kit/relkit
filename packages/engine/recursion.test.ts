import { describe, expect, test } from "bun:test";
import { createInvocationCallStack, RecursionPolicyError } from "./src/recursion.ts";

describe("invocation recursion policy", () => {
  test("denies direct recursion with a safe policy failure", () => {
    const stack = createInvocationCallStack().enter({
      functionId: "orders.create",
      invocationId: "invocation-1",
    });

    expect(() => stack.enter("orders.create", "invocation-2")).toThrow(RecursionPolicyError);
    try {
      stack.enter("orders.create");
    } catch (error) {
      expect(error).toMatchObject({
        code: "RELKIT_RECURSION_DENIED",
        functionId: "orders.create",
        callStack: ["orders.create"],
        cycle: ["orders.create", "orders.create"],
        message: "Invocation denied by recursion policy",
      });
    }
  });

  test("denies prohibited cycles without mutating sibling paths", () => {
    const first = createInvocationCallStack().enter("orders.a").enter("orders.b");
    const second = first.enter("orders.c");

    expect(() => second.enter("orders.b")).toThrow(RecursionPolicyError);
    expect(first.functionIds).toEqual(["orders.a", "orders.b"]);
    expect(second.functionIds).toEqual(["orders.a", "orders.b", "orders.c"]);
  });

  test("checks a deep path iteratively before adding another frame", () => {
    const frames = Array.from({ length: 10_000 }, (_, index) => ({
      functionId: `orders.${index}`,
    }));
    const stack = createInvocationCallStack(frames);

    expect(() => stack.enter("orders.0")).toThrow(RecursionPolicyError);
    expect(stack.frames).toHaveLength(10_000);
  });
});
