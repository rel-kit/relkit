import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { PendingApproval } from "@relkit/agents";
import { createAgentApprovalState } from "../../src/agent-approvals.js";

const approval: PendingApproval = {
  invocationId: "invocation",
  toolCallId: "call",
  toolId: "tool",
  sideEffect: "write",
  policy: "on-write",
  required: true,
  state: "pending",
};

it.effect("reset settles every pending approval and preserves selection errors", () =>
  Effect.gen(function* () {
    const controls = createAgentApprovalState("pending");
    const first = controls.handler!(approval);
    const second = controls.handler!({ ...approval, toolCallId: "other" });
    expect(controls.pending()).toHaveLength(2);
    expect(() => controls.approve()).toThrow("exactly one");
    controls.reset();
    expect(yield* Effect.promise(async () => first)).toBe("denied");
    expect(yield* Effect.promise(async () => second)).toBe("denied");
    expect(controls.pending()).toEqual([]);
  }),
);

it.effect("caller cancellation settles a registered approval resolver", () =>
  Effect.gen(function* () {
    const controls = createAgentApprovalState("pending");
    const controller = new AbortController();
    controls.registerSignal(approval.invocationId, controller.signal);
    const pending = controls.handler!(approval);
    controller.abort();
    expect(yield* Effect.promise(async () => pending)).toBe("denied");
    expect(controls.pending()).toEqual([]);
    controls.releaseSignal(approval.invocationId);
  }),
);
