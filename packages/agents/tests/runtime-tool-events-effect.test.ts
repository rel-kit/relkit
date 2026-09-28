import { Effect } from "effect";
import { expect, test } from "vitest";
import {
  emitTool,
  emitToolEffect,
  resolveAgentApproval,
  resolveAgentApprovalEffect,
} from "../src/runtime-tool-events.js";
import type { RuntimeToolOptions } from "../src/runtime-tool-events.types.js";

const signal = new AbortController().signal;
const turn = { callId: "call-1", toolId: "lookup" };
const request = { toolId: "lookup", sideEffect: "write", policy: "always" } as const;

test("tool event Effect and Promise adapter deliver ordered transition values", async () => {
  const events: unknown[] = [];
  const options = {
    contentSink: {
      emitTool: (event: unknown) => {
        events.push(event);
      },
    },
  } as unknown as RuntimeToolOptions;
  await Effect.runPromise(emitToolEffect(options, turn, "running", undefined, signal));
  await emitTool(options, turn, "succeeded", { ok: true }, signal);
  expect(events).toEqual([
    { toolCallId: "call-1", toolId: "lookup", state: "running" },
    { toolCallId: "call-1", toolId: "lookup", state: "succeeded", value: { ok: true } },
  ]);
});

test("approval Effect and Promise adapter preserve approved and required behavior", async () => {
  const states: string[] = [];
  const approved = {
    approval: () => "approved",
    contentSink: {
      emitTool: (event: { state: string }) => {
        states.push(event.state);
      },
    },
  } as unknown as RuntimeToolOptions;
  expect(
    await Effect.runPromise(
      resolveAgentApprovalEffect(approved, request, turn.callId, "run-1", signal),
    ),
  ).toBe(true);
  expect(await resolveAgentApproval(approved, request, turn.callId, "run-2", signal)).toBe(true);
  expect(states).toEqual(["approval-required", "running", "approval-required", "running"]);

  const missing = {} as RuntimeToolOptions;
  const failure = await Effect.runPromise(
    Effect.flip(resolveAgentApprovalEffect(missing, request, turn.callId, "run-3", signal)),
  );
  expect(failure).toMatchObject({ _tag: "AgentInvocationFailure" });
  await expect(
    resolveAgentApproval(missing, request, turn.callId, "run-4", signal),
  ).rejects.toMatchObject({ code: "RELKIT_APPROVAL_REQUIRED" });
});

test("pre-aborted tool and approval Effects do not start callbacks", async () => {
  const controller = new AbortController();
  controller.abort();
  let starts = 0;
  const options = {
    contentSink: {
      emitTool: () => {
        starts += 1;
      },
    },
    approval: () => {
      starts += 1;
      return "approved";
    },
  } as unknown as RuntimeToolOptions;
  const emitted = await Effect.runPromise(
    Effect.flip(emitToolEffect(options, turn, "running", undefined, controller.signal)),
  );
  const approved = await Effect.runPromise(
    Effect.flip(
      resolveAgentApprovalEffect(options, request, turn.callId, "run-5", controller.signal),
    ),
  );
  expect(emitted).toMatchObject({ _tag: "AgentInvocationFailure" });
  expect(approved).toMatchObject({ _tag: "AgentInvocationFailure" });
  expect(starts).toBe(0);
});
