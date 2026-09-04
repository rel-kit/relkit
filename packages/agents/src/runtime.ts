import { normalizeId, type MaybePromise } from "@relkit/contracts";
import { frameworkTrace } from "@relkit/invocation";
import { type AgentDescriptor } from "./define-agent.js";
import { resolveRuntimeModel } from "./runtime-model.js";
import {
  createExecutionSignal,
  signalFailure,
  validateValue,
  withSignal,
} from "./runtime-utils.js";
import { AgentRuntimeError } from "./runtime-errors.js";
import {
  createAgentCapturePolicy,
  type AgentCapturePolicy,
  type AgentRuntimeHooks,
} from "./observability.js";
import { generatedAgentFunctionId } from "./generated-function.js";
import { runAgentLoop } from "./runtime-loop.js";

type AgentAny = AgentDescriptor<string, unknown, unknown>;
type ApprovalDecision = "approved" | "denied" | boolean | import("./approval.js").ApprovalRecord;
export type AgentApprovalHandler = (
  approval: import("./approval.js").PendingApproval,
) => MaybePromise<ApprovalDecision>;

interface AgentRuntimeBaseOptions {
  readonly agent: AgentAny;
  readonly tools: import("@relkit/tools").ToolSource;
  readonly engine: import("@relkit/tools").ToolEngine;
  readonly maxInputBytes?: number;
  readonly maxOutputBytes?: number;
  readonly approval?: AgentApprovalHandler;
  readonly hooks?: AgentRuntimeHooks;
  readonly capture?: AgentCapturePolicy;
}

export type AgentRuntimeOptions = AgentRuntimeBaseOptions & {
  readonly modelRegistry: unknown;
};

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
  const runtimeModel = resolveRuntimeModel({
    ...(options.agent.model === undefined ? {} : { selector: options.agent.model }),
    registry: options.modelRegistry,
    ...(options.maxInputBytes === undefined ? {} : { maxInputBytes: options.maxInputBytes }),
    ...(options.maxOutputBytes === undefined ? {} : { maxOutputBytes: options.maxOutputBytes }),
  });
  const execution = createExecutionSignal(options);
  return frameworkTrace.span(
    `relkit.agent.${options.agent.id}.invoke`,
    {
      input: options.input,
      attributes: {
        "relkit.agent.id": options.agent.id,
        "relkit.function.id": generatedAgentFunctionId(options.agent.id),
        "relkit.invocation.id": invocationId,
        "relkit.model.id": runtimeModel.id,
      },
    },
    async () => {
      try {
        if (execution.signal.aborted) throw signalFailure(execution.signal);
        const input = await withSignal(
          validateValue(options.agent.input, options.input, "input"),
          execution.signal,
        );
        return await runAgentLoop(
          options,
          runtimeModel.model,
          runtimeModel.id,
          execution.signal,
          input,
          runtimeModel.maxInputBytes,
          runtimeModel.maxOutputBytes,
          invocationId,
          traceId,
          capture,
        );
      } finally {
        execution.close();
      }
    },
  );
}

/** Creates a reusable runtime for one immutable agent/provider/tool catalog. */
export function createAgentRuntime(options: AgentRuntimeOptions): AgentRuntime {
  return Object.freeze({
    invoke: (input: unknown, invocation: Omit<AgentInvocationOptions, "input"> = {}) =>
      invokeAgent({ ...options, ...invocation, input }),
  });
}

export const runAgent = invokeAgent;
