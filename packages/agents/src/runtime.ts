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
import { isGraphDescriptor, type GraphDescriptor } from "./define-graph.js";
import { invokeGraph } from "./graph-runtime.js";

type AgentAny = AgentDescriptor<string, unknown, unknown> | GraphDescriptor;
type ApprovalDecision = "approved" | "denied" | boolean | import("./approval.js").ApprovalRecord;
export type AgentApprovalHandler = (
  approval: import("./approval.js").PendingApproval,
) => MaybePromise<ApprovalDecision>;

export interface AgentSteeringSource {
  readonly drain: () => MaybePromise<readonly string[]>;
}

export interface AgentConversationMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export interface AgentContentSink {
  readonly emitOutput: (value: unknown, signal: AbortSignal) => MaybePromise<void>;
  readonly finishOutput?: (signal: AbortSignal) => MaybePromise<void>;
  readonly progressSinkForTool?: (tool: {
    readonly toolCallId: string;
    readonly toolId: string;
  }) => import("@relkit/invocation").ProgressSink;
  readonly emitTool?: (
    value: {
      readonly toolCallId: string;
      readonly toolId: string;
      readonly state: import("./state-types.js").ToolPartState;
      readonly value?: unknown;
    },
    signal: AbortSignal,
  ) => MaybePromise<void>;
  readonly emitEvent?: (
    value: import("./runtime-events.js").AgentExecutionEvent,
    signal: AbortSignal,
  ) => MaybePromise<void>;
  readonly emitMessage?: (
    value: import("@relkit/contracts").BrowserMessage,
    signal: AbortSignal,
  ) => MaybePromise<void>;
  readonly emitWaiting?: (
    value: Omit<import("./state-types.js").AgentWaitingState, "revision" | "runId">,
    signal: AbortSignal,
  ) => MaybePromise<void>;
}

interface AgentRuntimeBaseOptions {
  readonly agent: AgentAny;
  readonly tools: import("@relkit/tools").ToolSource;
  readonly bucketBackend?: import("./deepagent-bucket-files.js").DeepAgentBucketClient;
  readonly engine: import("@relkit/tools").ToolEngine;
  readonly maxInputBytes?: number;
  readonly maxOutputBytes?: number;
  readonly approval?: AgentApprovalHandler;
  readonly messages?: readonly AgentConversationMessage[];
  readonly steering?: AgentSteeringSource;
  readonly contentSink?: AgentContentSink;
  readonly hooks?: AgentRuntimeHooks;
  readonly capture?: AgentCapturePolicy;
  readonly environment?: Readonly<Record<string, unknown>>;
}

export type AgentRuntimeOptions = AgentRuntimeBaseOptions & {
  readonly modelRegistry?: unknown;
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
  readonly threadId?: string;
  readonly resume?: boolean;
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
  if (isGraphDescriptor(options.agent)) {
    return invokeGraph({ ...options, agent: options.agent });
  }
  const hooks = options.hooks;
  const capture = createAgentCapturePolicy(options.capture);
  const invocationId = normalizeId(options.invocationId ?? `agent-${crypto.randomUUID()}`);
  const traceId = normalizeId(options.traceId ?? invocationId);
  const runtimeModel = await resolveRuntimeModel({
    ...(options.agent.model === undefined ? {} : { model: options.agent.model }),
    registry: options.modelRegistry,
    environment: options.environment ?? {},
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
        const input = options.resume
          ? options.input
          : await withSignal(
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
