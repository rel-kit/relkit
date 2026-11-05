/** Builds the conformance agent, its tools, a recording engine, state, trace and access hooks. */
import { defineAgent } from "relkit/agents";
import {
  createAgentToolBridge,
  type AgentAccessCheck,
  type AgentAccessRequest,
  type AgentAdapterExecution,
  type AgentThreadState,
} from "relkit/agent-adapters";
import { defineFunction } from "relkit/functions";
import { z } from "relkit/schema";
import { defineTool, type ToolDescriptor } from "relkit/tools";
import type { AgentConformanceOptions, AgentConformanceTurn } from "./agents-conformance.types.js";

const lookup = async ({ id }: { readonly id: string }) => ({ status: `order ${id} shipped` });
const refund = async () => ({ refunded: true });
const lookupOrder = defineFunction({
  id: "conformance.lookup-order",
  input: z.object({ id: z.string() }),
  output: z.object({ status: z.string() }),
  handler: lookup,
});
const refundOrder = defineFunction({
  id: "conformance.refund-order",
  input: z.object({ id: z.string() }),
  output: z.object({ refunded: z.boolean() }),
  handler: refund,
});
export const lookupTool: ToolDescriptor<"conformance.lookup"> = defineTool({
  id: "conformance.lookup",
  target: lookupOrder,
  description: "Look up an order",
  sideEffect: "read",
  approval: "never",
});
export const refundTool: ToolDescriptor<"conformance.refund"> = defineTool({
  id: "conformance.refund",
  target: refundOrder,
  description: "Refund an order",
  sideEffect: "write",
  approval: "always",
});

/** Everything one case observes. */
export interface ConformanceRun {
  readonly execution: AgentAdapterExecution;
  readonly engineCalls: { readonly functionId: string; readonly input: unknown }[];
  readonly accessRequests: AgentAccessRequest[];
  readonly spans: { readonly span: string; outcome?: "ok" | "error" }[];
  readonly threads: Map<string, AgentThreadState>;
  readonly resolvedProfiles: (string | undefined)[];
}

/**
 * Creates one agent execution with recording hooks.
 * @param options - Adapter under test.
 * @param turns - Scripted model turns.
 * @param access - Optional engine access check.
 * @returns The execution and its recordings.
 */
export function conformanceRun(
  options: AgentConformanceOptions,
  turns: readonly AgentConformanceTurn[],
  access?: AgentAccessCheck,
): ConformanceRun {
  const agent = defineAgent({
    id: "conformance.agent",
    runtime: options.adapter(),
    model: "default",
    input: z.object({ message: z.string() }),
    output: z.object({ answer: z.string() }),
    instructions: "Answer order questions with the tools.",
    tools: [lookupTool, refundTool],
    limits: { maxSteps: 6, maxToolCalls: 4, timeoutMs: 10_000 },
  });
  const handlers: Record<string, (input: never) => Promise<unknown>> = {
    [lookupOrder.id]: lookup,
    [refundOrder.id]: refund,
  };
  const recorded: ConformanceRun = {
    execution: undefined as never,
    engineCalls: [],
    accessRequests: [],
    spans: [],
    threads: new Map(),
    resolvedProfiles: [],
  };
  const model = options.scriptedModel(turns);
  const trace = {
    start: (span: string) => {
      const entry: { span: string; outcome?: "ok" | "error" } = { span };
      recorded.spans.push(entry);
      return { end: (outcome: "ok" | "error") => void (entry.outcome = outcome) };
    },
  };
  const execution = options.runtime.execution({
    agent,
    models: {
      resolve: (selector) => {
        recorded.resolvedProfiles.push(selector);
        return { id: "conformance:scripted", profile: selector ?? "default", model };
      },
    },
    tools: createAgentToolBridge({
      agentId: agent.id,
      invocationId: "conformance.invocation",
      tools: [lookupTool, refundTool] as unknown as readonly ToolDescriptor<string>[],
      engine: {
        invoke: async (request) => {
          recorded.engineCalls.push({ functionId: request.functionId, input: request.input });
          return handlers[request.functionId]!(request.input as never);
        },
      },
      trace,
      ...(access === undefined
        ? {}
        : {
            access: (request: AgentAccessRequest) => {
              recorded.accessRequests.push(request);
              return access(request);
            },
          }),
    }),
    state: {
      load: (threadId) => recorded.threads.get(threadId),
      save: (state) => void recorded.threads.set(state.threadId, state),
    },
    trace,
  });
  return Object.assign(recorded, { execution });
}
