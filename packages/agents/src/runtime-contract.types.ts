/**
 * Carries SDK-independent conversation, approval and content callbacks between
 * native execution and transports; callbacks retain the caller's signal ownership.
 */
import type { MaybePromise } from "@relkit/contracts";
import type { AgentCapturePolicy, AgentRuntimeHooks } from "./observability.js";

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
