import { normalizeId, type MaybePromise } from "@zsys/contracts";
import { type AgentDescriptor } from "./define-agent.js";
import { type ModelProvider } from "./model-provider.js";
import {
  createExecutionSignal,
  signalFailure,
  validateValue,
  withSignal,
} from "./runtime-utils.js";
import { AgentRuntimeError } from "./runtime-errors.js";
import {
  captureAgentContent,
  createAgentSpanCapture,
  completeAgentSpan,
  createAgentCapturePolicy,
  emitAgentSpanComplete,
  emitAgentSpanStart,
  startAgentSpan,
  type AgentCapturePolicy,
  type AgentRuntimeHooks,
  type AgentSpanOutcome,
} from "./observability.js";
import { generatedAgentFunctionId } from "./generated-function.js";
import { runAgentLoop } from "./runtime-loop.js";

type AgentAny = AgentDescriptor<string, unknown, unknown>;
type ApprovalDecision = "approved" | "denied" | boolean | import("./approval.js").ApprovalRecord;
export type AgentApprovalHandler = (
  approval: import("./approval.js").PendingApproval,
) => MaybePromise<ApprovalDecision>;

export interface AgentRuntimeOptions {
  readonly agent: AgentAny;
  readonly provider: ModelProvider;
  readonly tools: import("@zsys/tools").ToolSource;
  readonly engine: import("@zsys/tools").ToolEngine;
  readonly maxInputBytes?: number;
  readonly maxOutputBytes?: number;
  readonly approval?: AgentApprovalHandler;
  readonly hooks?: AgentRuntimeHooks;
  readonly capture?: AgentCapturePolicy;
}

export interface AgentInvocationOptions {
  readonly input: unknown;
  readonly invocationId?: string;
  readonly signal?: AbortSignal;
  readonly deadlineMs?: number;
  readonly timeoutMs?: number;
  readonly approval?: AgentApprovalHandler;
  readonly traceId?: string;
  readonly parentSpanId?: string;
  readonly hooks?: AgentRuntimeHooks;
  readonly capture?: AgentCapturePolicy;
}

export interface AgentRuntime {
  readonly invoke: (
    input: unknown,
    options?: Omit<AgentInvocationOptions, "input">,
  ) => Promise<unknown>;
}

export { AgentRuntimeError } from "./runtime-errors.js";

/** Runs one validated agent invocation through the supplied function-engine seam. */
export async function invokeAgent(
  options: AgentRuntimeOptions & AgentInvocationOptions,
): Promise<unknown> {
  const hooks = options.hooks;
  const capture = createAgentCapturePolicy(options.capture);
  const invocationId = normalizeId(options.invocationId ?? `agent-${crypto.randomUUID()}`);
  const traceId = normalizeId(options.traceId ?? invocationId);
  const execution = createExecutionSignal(options);
  const agentSpan = startAgentSpan({
    kind: "agent",
    agentId: options.agent.id,
    invocationId,
    functionId: generatedAgentFunctionId(options.agent.id),
    name: `zsys.agent.${options.agent.id}.invoke`,
    traceId,
    ...(options.parentSpanId === undefined ? {} : { parentSpanId: options.parentSpanId }),
    attributes: {
      "zsys.agent.id": options.agent.id,
      "zsys.model.profile": options.provider.profile,
    },
  });
  emitAgentSpanStart(hooks, agentSpan);
  let outcome: AgentSpanOutcome = "error";
  try {
    if (execution.signal.aborted) throw signalFailure(execution.signal);
    const input = await withSignal(
      validateValue(options.agent.input, options.input, "input"),
      execution.signal,
    );
    const provider = options.provider;
    if (normalizeId(provider.profile) !== options.agent.modelProfile)
      throw new AgentRuntimeError(
        "ZSYS_AGENT_PROFILE_MISMATCH",
        "Model profile does not match agent",
      );
    if (!provider.capabilities.cancellation)
      throw new AgentRuntimeError(
        "ZSYS_AGENT_CANCELLATION_UNSUPPORTED",
        "Model cancellation is required",
      );
    if (options.agent.tools.length > 0 && !provider.capabilities.toolCalls)
      throw new AgentRuntimeError(
        "ZSYS_AGENT_TOOL_CALLS_UNSUPPORTED",
        "Model tool calls are required",
      );
    const maxInputBytes = boundedLimit(options.maxInputBytes, provider.capabilities.maxInputBytes);
    const maxOutputBytes = boundedLimit(
      options.maxOutputBytes,
      provider.capabilities.maxOutputBytes,
    );
    const result = await runAgentLoop(
      options,
      execution.signal,
      input,
      maxInputBytes,
      maxOutputBytes,
      invocationId,
      traceId,
      agentSpan.spanId,
      capture,
    );
    outcome = "success";
    return result;
  } catch (cause) {
    if (execution.signal.aborted) outcome = "cancelled";
    else if (cause instanceof AgentRuntimeError && cause.code.includes("LIMIT")) outcome = "limit";
    throw cause;
  } finally {
    execution.close();
    emitAgentSpanComplete(
      hooks,
      completeAgentSpan(
        agentSpan,
        outcome,
        createAgentSpanCapture(captureAgentContent(options.input, capture), undefined),
      ),
    );
  }
}

/** Creates a reusable runtime for one immutable agent/provider/tool catalog. */
export function createAgentRuntime(options: AgentRuntimeOptions): AgentRuntime {
  return Object.freeze({
    invoke: (input: unknown, invocation: Omit<AgentInvocationOptions, "input"> = {}) =>
      invokeAgent({ ...options, ...invocation, input }),
  });
}

export const runAgent = invokeAgent;

function boundedLimit(value: number | undefined, providerLimit: number): number {
  const limit = value ?? providerLimit;
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > providerLimit)
    throw new AgentRuntimeError("ZSYS_AGENT_LIMIT_INVALID", "Agent content limit is invalid");
  return limit;
}
