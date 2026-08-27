import { describe, expect, test } from "bun:test";
import {
  bindDescriptorIdentity,
  createInvocationCallStack,
  RecursionPolicyError,
} from "./src/index.ts";

describe("shared invocation recursion policy", () => {
  test("rejects direct and dynamic cycles before appending a frame", () => {
    const first = {};
    const second = {};
    bindDescriptorIdentity(first, "orders.a");
    bindDescriptorIdentity(second, "orders.b");
    const stack = createInvocationCallStack().enterDescriptor(first).enterDescriptor(second);

    expect(() => stack.enterDescriptor(first)).toThrow(RecursionPolicyError);
    expect(stack.functionIds).toEqual(["orders.a", "orders.b"]);
    expect(() => stack.enter("orders.b")).toThrow(RecursionPolicyError);
  });

  test("does not confuse separate unbound descriptors with a cycle", () => {
    const first = {};
    const second = {};
    const stack = createInvocationCallStack().enterDescriptor(first).enterDescriptor(second);

    expect(stack.frames).toHaveLength(2);
    expect(() => stack.enterDescriptor(first)).toThrow(RecursionPolicyError);
    try {
      stack.enterDescriptor(first);
    } catch (error) {
      expect(error).toMatchObject({ code: "RELKIT_RECURSION_DENIED" });
    }
  });
});
