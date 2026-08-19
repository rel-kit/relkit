import { describe, expect, test } from "bun:test";
import {
  ApprovalDeniedError,
  ApprovalRequiredError,
  approveApproval,
  assertApprovalGranted,
  createApproval,
  denyApproval,
  requiresApproval,
} from "./src/index.ts";

describe("tool approval policy", () => {
  test("enforces all policies and operation classes", () => {
    const expected = {
      never: [false, false, false, false],
      "on-write": [false, false, true, true],
      always: [true, true, true, true],
    } as const;
    for (const [policy, values] of Object.entries(expected)) {
      expect(
        ["none", "read", "write", "external"].map((sideEffect) =>
          requiresApproval(policy as never, sideEffect as never),
        ),
      ).toEqual(values);
    }
  });

  test("keeps pending decisions tied to safe invocation metadata", () => {
    const pending = createApproval({
      invocationId: "invocation-1",
      toolCallId: "call_1",
      toolId: "orders.update.tool",
      sideEffect: "write",
      policy: "on-write",
    });
    expect(pending).toMatchObject({
      invocationId: "invocation-1",
      toolCallId: "call_1",
      toolId: "orders.update.tool",
      sideEffect: "write",
      policy: "on-write",
      required: true,
      state: "pending",
    });
    expect(Object.isFrozen(pending)).toBe(true);
    expect("arguments" in pending).toBe(false);
    expect(() => assertApprovalGranted(pending)).toThrow(ApprovalRequiredError);

    const approved = approveApproval(pending);
    expect(approved.state).toBe("approved");
    assertApprovalGranted(approved);

    const denied = denyApproval(pending);
    expect(denied.state).toBe("denied");
    expect(() => assertApprovalGranted(denied)).toThrow(ApprovalDeniedError);
  });
});
