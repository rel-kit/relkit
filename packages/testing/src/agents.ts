import type { AgentApprovalHandler, AgentObservedEdge, PendingApproval } from "@zsys/agents";
import { invokeAgent } from "@zsys/agents";
import { createFailures } from "./jobs-utils.js";
import { createTestModel } from "./agents-model.js";
import type {
  TestAgent,
  TestAgentApproval,
  TestAgentDescriptor,
  TestAgentInvocationOptions,
  TestAgentOptions,
  TestAgentTrace,
} from "./agents-types.js";
import { assertAgentTrace, captureHooks, createTrace } from "./agents-utils.js";

export type {
  TestAgent,
  TestAgentApproval,
  TestAgentApprovalMode,
  TestAgentApprovals,
  TestAgentDescriptor,
  TestAgentInvocationOptions,
  TestAgentModel,
  TestAgentModelCall,
  TestAgentModelOptions,
  TestAgentOptions,
  TestAgentTrace,
  TestAgentTraceExpectation,
  TestAgentTraceSnapshot,
  TestModelTurn,
} from "./agents-types.js";
export { assertAgentTrace } from "./agents-utils.js";

/** Creates an isolated, network-free agent harness around the existing runtime seam. */
export function createTestAgent<Agent extends TestAgentDescriptor>(
  options: TestAgentOptions<Agent>,
): TestAgent<Agent> {
  const failures = options.failures ?? createFailures();
  const model = createTestModel({
    ...(options.model ?? {}),
    ...(options.script === undefined ? {} : { script: options.script }),
  });
  const spans: import("@zsys/agents").AgentSpanRecord[] = [];
  const edges: AgentObservedEdge[] = [];
  const pending = new Map<string, PendingApproval>();
  const resolvers = new Map<string, (decision: "approved" | "denied") => void>();
  const trace = createTrace(spans, edges);
  const hooks = captureHooks(options.hooks, spans, edges);
  const engine = {
    invoke: async (request: Parameters<typeof options.engine.invoke>[0]) => {
      const result = await options.engine.invoke(request);
      failures.check("model.after-tool-call");
      return result;
    },
  } satisfies typeof options.engine;
  const approval = createApprovalHandler(options.approval, pending, resolvers);
  let invocationSequence = 0;

  const invoke = async (
    input: import("@zsys/schema").InferInput<Agent["input"]>,
    invocation: TestAgentInvocationOptions = {},
  ): Promise<import("@zsys/schema").InferOutput<Agent["output"]>> => {
    const invocationId = invocation.invocationId ?? `test-agent-${++invocationSequence}`;
    return invokeAgent({
      agent: options.agent,
      tools: options.tools,
      engine,
      modelRegistry: {
        resolveModel: () => ({ id: model.modelId, model: model.languageModel }),
      },
      ...(options.maxInputBytes === undefined ? {} : { maxInputBytes: options.maxInputBytes }),
      ...(options.maxOutputBytes === undefined ? {} : { maxOutputBytes: options.maxOutputBytes }),
      ...(approval === undefined ? {} : { approval }),
      ...(options.capture === undefined ? {} : { capture: options.capture }),
      ...invocation,
      input,
      invocationId,
      traceId: invocation.traceId ?? invocationId,
      hooks,
    }) as Promise<import("@zsys/schema").InferOutput<Agent["output"]>>;
  };
  const approvals = Object.freeze({
    pending: () => Object.freeze([...pending.values()]),
    approve: (toolCallId?: string) => resolvePending(toolCallId, "approved"),
    deny: (toolCallId?: string) => resolvePending(toolCallId, "denied"),
  });
  return Object.freeze({
    model,
    failures,
    approvals,
    pending: approvals.pending,
    trace,
    script: model.script,
    invoke,
    reset: () => {
      model.reset();
      trace.clear();
      pending.clear();
      resolvers.clear();
      invocationSequence = 0;
    },
  });

  function resolvePending(toolCallId: string | undefined, decision: "approved" | "denied"): void {
    const matches = [...pending.entries()].filter(
      ([key, approval]) =>
        toolCallId === undefined ||
        approval.toolCallId === toolCallId ||
        approval.toolId === toolCallId ||
        key === toolCallId,
    );
    if (matches.length !== 1) throw new Error("Expected exactly one matching pending approval");
    const [key] = matches[0]!;
    pending.delete(key);
    resolvers.get(key)!(decision);
    resolvers.delete(key);
  }
}

function createApprovalHandler(
  choice: TestAgentApproval | undefined,
  pending: Map<string, PendingApproval>,
  resolvers: Map<string, (decision: "approved" | "denied") => void>,
): AgentApprovalHandler | undefined {
  if (choice === undefined) return undefined;
  if (typeof choice === "function") return choice;
  if (choice !== "pending") return () => choice;
  return (approval) =>
    new Promise<"approved" | "denied">((resolve) => {
      const key = `${approval.invocationId}:${approval.toolCallId}`;
      pending.set(key, approval);
      resolvers.set(key, resolve);
    });
}
