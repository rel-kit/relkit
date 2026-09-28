import type { MaybePromise } from "@relkit/contracts";
import type { AgentDescriptor } from "./define-agent.js";
import type { GraphDescriptor } from "./define-graph.js";
import type { AgentCapturePolicy, AgentRuntimeHooks } from "./observability.js";

type AgentAny = AgentDescriptor<string, unknown, unknown> | GraphDescriptor;
type ApprovalDecision = "approved" | "denied" | boolean | import("./approval.js").ApprovalRecord;

/** Resolves a pending tool approval for an invocation. */
export type AgentApprovalHandler = (
  approval: import("./approval.js").PendingApproval,
) => MaybePromise<ApprovalDecision>;

/** Supplies queued steering messages to a running agent. */
export interface AgentSteeringSource {
  readonly drain: () => MaybePromise<readonly string[]>;
}

/** One user or assistant message in a native agent conversation. */
export interface AgentConversationMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

/** Sends agent output and events to the surrounding runtime. */
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
      readonly state: import("./state.types.js").ToolPartState;
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
    value: Omit<import("./state.types.js").AgentWaitingState, "revision" | "runId">,
    signal: AbortSignal,
  ) => MaybePromise<void>;
}

/** Common authoring and execution dependencies for an agent runtime. */
export interface AgentRuntimeBaseOptions {
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

/** Long-lived dependencies shared by agent invocations. */
export type AgentRuntimeOptions = AgentRuntimeBaseOptions & {
  readonly modelRegistry?: unknown;
};

/** Per-call identity, input, cancellation, and control options. */
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

/** Reusable invocation API bound to one agent catalog. */
export interface AgentRuntime {
  readonly invoke: (
    input: unknown,
    options?: Omit<AgentInvocationOptions, "input">,
  ) => Promise<unknown>;
}
