import { Effect, Result } from "effect";
import { expect, test } from "vitest";
import {
  nativeAgentResumeCommandEffect,
  nativeAgentWaitingInterruptsEffect,
  validateNativeAgentResumeInput,
  validateNativeAgentResumeInputEffect,
} from "../src/native-agent-interruption.js";

const request = {
  id: "review-1",
  node: "agent",
  value: {
    actionRequests: [{ name: "pay", args: { amount: 1 } }],
    reviewConfigs: [{ actionName: "pay", allowedDecisions: ["approve", "reject"] }],
  },
};
const requests = [request] as never;

test("native resume Effect validates decisions and tags invalid replies", () => {
  const reply = { decisions: [{ type: "approve" }] };
  expect(Effect.runSync(validateNativeAgentResumeInputEffect(requests, reply))).toEqual(reply);
  expect(validateNativeAgentResumeInput(requests, reply)).toEqual(reply);

  const failure = Effect.runSync(
    Effect.result(
      validateNativeAgentResumeInputEffect(requests, {
        decisions: [{ type: "edit" }],
      }),
    ),
  );
  expect(Result.isFailure(failure)).toBe(true);
  if (Result.isFailure(failure))
    expect(failure.failure._tag).toBe("NativeAgentInterruptionFailure");
  expect(() => validateNativeAgentResumeInput(requests, { decisions: [{ type: "edit" }] })).toThrow(
    "Agent continuation decision is not allowed",
  );
});

test("native continuation Effect reads nested waiting state and builds a command", async () => {
  const agent = {
    getState: async () => ({
      tasks: [{ name: "agent", interrupts: [{ id: "review-1", value: request.value }] }],
    }),
  } as never;
  const waiting = await Effect.runPromise(nativeAgentWaitingInterruptsEffect(agent, {}));
  expect(waiting).toHaveLength(1);
  expect(waiting[0]?.id).toBe("review-1");
  const command = await Effect.runPromise(
    nativeAgentResumeCommandEffect(agent, {}, { decisions: [{ type: "approve" }] }),
  );
  expect(command.resume).toEqual({ "review-1": { decisions: [{ type: "approve" }] } });
});

test("interrupting native waiting lookup aborts the provider signal", async () => {
  const controller = new AbortController();
  let started!: () => void;
  const start = new Promise<void>((resolve) => {
    started = resolve;
  });
  let observedAbort = false;
  const agent = {
    getState: (config: { signal: AbortSignal }) =>
      new Promise<never>((_resolve, reject) => {
        config.signal.addEventListener(
          "abort",
          () => {
            observedAbort = true;
            reject(config.signal.reason);
          },
          { once: true },
        );
        started();
      }),
  } as never;
  const running = Effect.runPromise(nativeAgentWaitingInterruptsEffect(agent, {}), {
    signal: controller.signal,
  });
  await start;
  controller.abort(new Error("stopped"));
  await expect(running).rejects.toBeDefined();
  expect(observedAbort).toBe(true);
});

test("native review validation preserves ordered replies and rejects malformed decisions", () => {
  const both = [request, { ...request, id: "review-2" }] as never;
  const replies = [
    { decisions: [{ type: "approve" }] },
    { decisions: [{ type: "reject", message: "Needs review" }] },
  ];
  expect(Effect.runSync(validateNativeAgentResumeInputEffect(both, replies))).toEqual(replies);
  expect(validateNativeAgentResumeInput(both, replies)).toEqual(replies);
  expect(() => validateNativeAgentResumeInput(both, replies.slice(0, 1))).toThrow(
    "Agent continuation requires 2 replies",
  );
  expect(() => validateNativeAgentResumeInput([], replies)).toThrow(
    "Agent has no waiting continuation",
  );
  expect(() =>
    validateNativeAgentResumeInput(requests, {
      decisions: [{ type: "approve", extra: true }],
    }),
  ).toThrow("Agent continuation has unknown fields");
  expect(() =>
    validateNativeAgentResumeInput(requests, {
      decisions: [{ type: "reject", message: 7 }],
    }),
  ).toThrow("Agent rejection message must be text");
});

test("edited native decisions validate action identity and argument schema", () => {
  const editable = [
    {
      ...request,
      value: {
        ...request.value,
        reviewConfigs: [
          {
            actionName: "pay",
            allowedDecisions: ["edit"],
            argsSchema: {
              type: "object",
              properties: { amount: { type: "number" } },
              required: ["amount"],
              additionalProperties: false,
            },
          },
        ],
      },
    },
  ] as never;
  const reply = {
    decisions: [
      {
        type: "edit",
        editedAction: { name: "pay", args: { amount: 2 } },
      },
    ],
  };
  expect(Effect.runSync(validateNativeAgentResumeInputEffect(editable, reply))).toEqual(reply);
  expect(() =>
    validateNativeAgentResumeInput(editable, {
      decisions: [{ type: "edit", editedAction: { name: "refund", args: { amount: 2 } } }],
    }),
  ).toThrow("Agent edited action is invalid");
  expect(() =>
    validateNativeAgentResumeInput(editable, {
      decisions: [{ type: "edit", editedAction: { name: "pay", args: { amount: "two" } } }],
    }),
  ).toThrow("Agent edited action arguments are invalid");
});
