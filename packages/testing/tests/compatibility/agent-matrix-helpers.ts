import type { JsonValue } from "@relkit/contracts";
import { defineAgent } from "@relkit/agents";
import { invokeFunction, type InvocationParent, type InvocationTarget } from "@relkit/engine";
import { defineError, defineFunction } from "@relkit/functions";
import { z } from "@relkit/schema";
import {
  defineTool,
  type ToolDescriptor,
  type ToolEngine,
  type ToolEngineInvocation,
} from "@relkit/tools";
import { createTestAgent } from "../fixtures/owned-compatibility.ts";
import type { TestAgentModelOptions, TestModelTurn } from "../../src/index.ts";

import type { TargetFailure } from "./agent-matrix-helpers.types.ts";
export type { TargetFailure } from "./agent-matrix-helpers.types.ts";

/**
 * Defines one tool-enabled agent and captures its unchanged native engine requests.
 * @param options - Approval policy, execution limits, side effect, and native failure branch.
 * @returns Agent/tool/function descriptors, declared error constructor, and captured invocations.
 */
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
        return new unavailable({ reason: `order ${input.id} is unavailable` });
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
    model: "default",
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

/**
 * Supplies a deterministic tool call followed by the matrix's successful final answer.
 * @param toolId - Declared tool identifier forwarded to the scripted model.
 * @param input - Native JSON tool input retained without schema coercion.
 * @param answer - Final answer expected by the compatibility assertions.
 * @returns The ordered native model turns.
 */
export function scriptedToolCall(
  toolId: string,
  input: JsonValue = { id: "1" },
  answer = "ready",
): readonly TestModelTurn[] {
  return [
    { type: "tool-call", callId: "call-1", toolId, input },
    { type: "final", output: { answer } },
  ];
}

/**
 * Acquires an agent owner tracked by the shared compatibility afterEach cleanup.
 * @param fixture - Native descriptors and default engine supplied by makeFixture.
 * @param script - Ordered native turns used for this isolated model owner.
 * @param options - Explicit approval, engine, size limits, model policy, or tool overrides.
 * @returns The native test agent facade registered for failure-safe cleanup.
 */
export function harness(
  fixture: ReturnType<typeof makeFixture>,
  script: readonly TestModelTurn[],
  options: {
    readonly approval?: "approved" | "denied" | "pending";
    readonly engine?: ToolEngine;
    readonly maxInputBytes?: number;
    readonly maxOutputBytes?: number;
    readonly model?: TestAgentModelOptions;
    readonly tools?: readonly ToolDescriptor<string>[];
  } = {},
) {
  return createTestAgent({
    agent: fixture.agent,
    tools: options.tools ?? [fixture.tool],
    engine: options.engine ?? fixture.engine,
    script,
    ...(options.maxInputBytes === undefined ? {} : { maxInputBytes: options.maxInputBytes }),
    ...(options.maxOutputBytes === undefined ? {} : { maxOutputBytes: options.maxOutputBytes }),
    ...(options.model === undefined ? {} : { model: options.model }),
    ...(options.approval === undefined ? {} : { approval: options.approval }),
  });
}

/**
 * Reads the retained tool response observed by the model's second request.
 * @param agent - Native harness whose captured model calls remain assertion authority.
 * @returns The final message of that request, or undefined before it is captured.
 */
export function toolMessage(agent: ReturnType<typeof harness>): unknown {
  return agent.model.calls[1]?.request.messages.at(-1);
}

/**
 * Adapts the matrix's native function descriptor to the production invocation engine.
 * @param target - Known fixture descriptor cast to the native invocation contract.
 * @returns An engine forwarding source, signal, timeout, and parent without transformation.
 */
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
