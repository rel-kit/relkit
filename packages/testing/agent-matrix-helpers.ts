import type { JsonValue } from "@zsys/contracts";
import { defineAgent, type ModelTurn } from "@zsys/agents";
import { invokeFunction, type InvocationParent, type InvocationTarget } from "@zsys/engine";
import { defineError, defineFunction } from "@zsys/functions";
import { z } from "@zsys/schema";
import {
  defineTool,
  type ToolDescriptor,
  type ToolEngine,
  type ToolEngineInvocation,
} from "@zsys/tools";
import { createTestAgent } from "./src/index.ts";

export type TargetFailure = "declared" | "defect";

export function makeFixture(
  options: {
    readonly approval?: "never" | "on-write" | "always";
    readonly maxSteps?: number;
    readonly maxToolCalls?: number;
    readonly sideEffect?: "none" | "read" | "write" | "external";
    readonly targetFailure?: TargetFailure;
  } = {},
) {
  const unavailable = defineError({
    id: "orders.unavailable",
    data: z.object({ reason: z.string() }),
    message: "Order unavailable",
    retry: "never",
    http: { status: 409 },
  });
  const target = defineFunction({
    id: "orders.lookup",
    input: z.object({ id: z.string() }),
    output: z.object({ state: z.string() }),
    errors: [unavailable],
    handler: async (input) => {
      if (options.targetFailure === "declared") {
        throw unavailable.create({ reason: `order ${input.id} is unavailable` });
      }
      if (options.targetFailure === "defect") throw new Error("database-password");
      return { state: "ready" };
    },
  });
  const tool = defineTool({
    id: "orders.lookup.tool",
    target,
    description: "Look up an order",
    sideEffect: options.sideEffect ?? "read",
    approval: options.approval ?? "never",
    timeoutMs: 25,
  });
  const agent = defineAgent({
    id: "support.order",
    input: z.object({ question: z.string() }),
    output: z.object({ answer: z.string() }),
    modelProfile: "default",
    instructions: "Answer order questions without exposing internal details.",
    tools: [tool],
    limits: {
      maxSteps: options.maxSteps ?? 3,
      maxToolCalls: options.maxToolCalls ?? 2,
      timeoutMs: 1_000,
    },
  });
  const invocations: ToolEngineInvocation[] = [];
  const engine: ToolEngine = {
    invoke: async (request) => {
      invocations.push(request);
      return { state: "ready" };
    },
  };
  return { agent, target, tool, unavailable, engine, invocations };
}

export function scriptedToolCall(
  toolId: string,
  input: JsonValue = { id: "1" },
  answer = "ready",
): readonly ModelTurn[] {
  return [
    { type: "tool-call", callId: "call-1", toolId, input },
    { type: "final", output: { answer } },
  ];
}

export function harness(
  fixture: ReturnType<typeof makeFixture>,
  script: readonly ModelTurn[],
  options: {
    readonly approval?: "approved" | "denied" | "pending";
    readonly engine?: ToolEngine;
    readonly tools?: readonly ToolDescriptor<string>[];
  } = {},
) {
  return createTestAgent({
    agent: fixture.agent,
    tools: options.tools ?? [fixture.tool],
    engine: options.engine ?? fixture.engine,
    script,
    ...(options.approval === undefined ? {} : { approval: options.approval }),
  });
}

export function toolMessage(agent: ReturnType<typeof harness>): unknown {
  return agent.model.calls[1]?.request.messages.at(-1);
}

export function engineForTarget(target: unknown): ToolEngine {
  const invocationTarget = target as InvocationTarget;
  return {
    invoke: (request) =>
      invokeFunction(invocationTarget, request.input, {
        source: request.source,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
        ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
        ...(request.parent === undefined ? {} : { parent: request.parent as InvocationParent }),
      }),
  };
}
