/** Execution half of the agent adapter interface: stream frames, run results, the context RelKit
 * hands an adapter, and the run, stream, resume and stop contract. */
import type { StandardSchemaV1 } from "../schema/index.js";
import type { PendingApproval } from "../agents/approval.types.js";
import type {
  AgentModelResolver,
  AgentRuntimeReference,
  AgentStateHooks,
  AgentThreadMessage,
  AgentToolBridge,
  AgentToolCall,
  AgentToolDefinition,
  AgentToolOutcome,
  AgentTraceHooks,
  ResolvedAgentModel,
} from "./adapter.types.js";

/** Neutral stream frames an adapter run emits; RelKit maps them to AG-UI events. @experimental */
export type AgentAdapterFrame =
  | { readonly kind: "run-started"; readonly threadId: string; readonly runId: string }
  | { readonly kind: "text"; readonly messageId: string; readonly delta: string }
  | { readonly kind: "tool-call"; readonly call: AgentToolCall; readonly toolId: string }
  | { readonly kind: "tool-result"; readonly outcome: AgentToolOutcome; readonly toolId: string }
  | { readonly kind: "approval"; readonly approvals: readonly PendingApproval[] }
  | {
      readonly kind: "run-finished";
      readonly threadId: string;
      readonly runId: string;
      readonly result: AgentRunResult;
    }
  | { readonly kind: "run-error"; readonly code: string; readonly message: string };

/** Result of a run or resume. @experimental */
export type AgentRunResult =
  | { readonly status: "completed"; readonly threadId: string; readonly output: unknown }
  | {
      readonly status: "interrupted";
      readonly threadId: string;
      readonly runId: string;
      readonly approvals: readonly PendingApproval[];
    }
  | { readonly status: "stopped"; readonly threadId: string; readonly runId: string };

/** Everything RelKit hands an adapter for one agent. @experimental */
export interface AgentAdapterContext {
  readonly agent: AgentAdapterAgent;
  readonly models: AgentModelResolver;
  readonly tools: AgentToolBridge;
  readonly state: AgentStateHooks;
  readonly trace?: AgentTraceHooks;
}

/** Agent fields an adapter reads at execution time. @experimental */
export interface AgentAdapterAgent {
  readonly id: string;
  readonly model?: string;
  readonly instructions: unknown;
  readonly output: StandardSchemaV1;
  readonly limits: {
    readonly maxSteps: number;
    readonly maxToolCalls: number;
    readonly timeoutMs: number;
  };
  readonly runtime: AgentRuntimeReference;
}

/** Start of a run. @experimental */
export interface AgentRunRequest {
  readonly input: unknown;
  readonly threadId: string;
  readonly runId?: string;
  readonly signal?: AbortSignal;
}

/** Continuation of an interrupted run with approval decisions. @experimental */
export interface AgentResumeRequest {
  readonly threadId: string;
  readonly decisions: Readonly<Record<string, "approved" | "denied">>;
  readonly signal?: AbortSignal;
}

/** Execution contract every adapter runtime implements. @experimental */
export interface AgentAdapterExecution {
  readonly run: (request: AgentRunRequest) => Promise<AgentRunResult>;
  readonly stream: (request: AgentRunRequest) => AsyncIterable<AgentAdapterFrame>;
  readonly resume: (request: AgentResumeRequest) => Promise<AgentRunResult>;
  readonly stop: (runId: string) => Promise<void>;
}

/** One model turn: the only SDK-specific step of an agent loop. @experimental */
export interface AgentModelTurnRequest {
  readonly model: ResolvedAgentModel;
  readonly messages: readonly AgentThreadMessage[];
  readonly tools: readonly AgentToolDefinition[];
  readonly signal: AbortSignal;
}

/** What a model returned in one turn. @experimental */
export interface AgentModelTurn {
  readonly text: string;
  readonly toolCalls: readonly AgentToolCall[];
}

/** Runtime half of an adapter, exported from the adapter package's runtime entry. @experimental */
export interface AgentAdapterRuntime<AdapterId extends string = string> {
  readonly adapterId: AdapterId;
  readonly protocolVersion: 1;
  /** Creates the run, stream, resume and stop contract for one agent. */
  readonly execution: (context: AgentAdapterContext) => AgentAdapterExecution;
}
