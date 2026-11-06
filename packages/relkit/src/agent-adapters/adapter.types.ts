/**
 * Declares the agent adapter interface: the authoring value an agent's `runtime` field holds, and
 * the execution contract (run, stream, resume, stop) an adapter implements on top of RelKit's tool
 * bridge, model profiles, state hooks and AG-UI event mapping.
 */
import type { MaybePromise } from "../contracts/index.js";
import type { ApprovalRecord, PendingApproval } from "../agents/approval.types.js";

/** Serializable identity of an agent adapter, copied into descriptors and the graph.
 * @experimental
 */
export interface AgentRuntimeReference<AdapterId extends string = string> {
  readonly kind: "agent-runtime";
  readonly adapterId: AdapterId;
  /** Package integration that registers the adapter's `agent-execution` capability. */
  readonly integrationId: string;
  readonly protocolVersion: 1;
  /** Adapter-specific option keys the agent uses; a non-empty list ties the agent to this adapter. */
  readonly nativeOptions: readonly string[];
}

/** Portable fields every adapter receives when an agent is defined.
 * @experimental
 */
export interface AgentAdapterDefinitionInput {
  readonly id: string;
  /** The authored `defineAgent` options without `runtime`. */
  readonly options: Readonly<Record<string, unknown>>;
  /** The portable descriptor RelKit built before the adapter adds its fields. */
  readonly descriptor: Readonly<Record<string, unknown>>;
}

/**
 * Value stored in an agent's `runtime` field. It carries adapter options only and never loads an
 * SDK: execution lives in the adapter package's runtime entry.
 * @typeParam AdapterId - Stable adapter identity, such as `langchain` or `ai-sdk`.
 * @typeParam Options - The adapter's own options, kept as authored.
 * @typeParam Native - Descriptor fields the adapter adds; the type `defineAgent` returns includes them.
 * @typeParam StateKey - Client state keys the adapter's native options expose.
 * @experimental
 */
export interface AgentRuntimeAdapter<
  AdapterId extends string = string,
  Options = unknown,
  Native extends object = {},
  StateKey extends string = never,
> extends AgentRuntimeReference<AdapterId> {
  readonly options: Options;
  /** Client state keys an agent may expose through `client.state`. */
  readonly clientStateKeys: readonly StateKey[];
  /**
   * Adds adapter-owned descriptor fields, validating adapter options against the portable ones.
   * @param input - Agent identity, authored options and the portable descriptor.
   * @returns Fields merged over the portable descriptor.
   */
  readonly extend?: (input: AgentAdapterDefinitionInput) => Readonly<Record<string, unknown>>;
  /** Phantom marker carrying the native descriptor fields; never present at runtime. */
  readonly "~native"?: Native;
}

/** Any agent adapter value. @experimental */
export type AgentRuntimeAdapterAny = AgentRuntimeAdapter<string, unknown, object, string>;

/** Native descriptor fields an adapter value adds. @experimental */
export type AgentRuntimeNativeFields<Runtime> =
  Runtime extends AgentRuntimeAdapter<string, unknown, infer Native, string> ? Native : {};

/** Client state keys an adapter value exposes. @experimental */
export type AgentRuntimeStateKey<Runtime> =
  Runtime extends AgentRuntimeAdapter<string, unknown, object, infer StateKey> ? StateKey : never;

/** A model selected from a profile bound in `relkit.config.ts`. @experimental */
export interface ResolvedAgentModel {
  /** Stable model identity, such as `openai:gpt-5`. */
  readonly id: string;
  /** Profile the model was resolved from. */
  readonly profile: string;
  /** Adapter-native model value or a provider-qualified model name. */
  readonly model: unknown;
}

/** Resolves the model profile an agent references; adapters never read configuration directly.
 * @experimental
 */
export interface AgentModelResolver {
  /**
   * @param selector - The agent's `model` value, such as `default` or `default:gpt-5`.
   * @returns The bound model for that profile.
   */
  readonly resolve: (selector: string | undefined) => MaybePromise<ResolvedAgentModel>;
}

/** Tool exposed to a model through the bridge. @experimental */
export interface AgentToolDefinition {
  readonly id: string;
  /** Model-facing name; dots are replaced so every SDK accepts it. */
  readonly name: string;
  readonly description: string;
  /** JSON Schema of the tool input. */
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly requiresApproval: boolean;
}

/** One tool call requested by a model. @experimental */
export interface AgentToolCall {
  readonly toolCallId: string;
  /** Model-facing tool name. */
  readonly name: string;
  readonly input: unknown;
}

/** Request passed to the engine's access check before a tool runs. @experimental */
export interface AgentAccessRequest {
  readonly source: "agent";
  readonly agentId: string;
  readonly toolId: string;
  readonly functionId: string;
  readonly input: unknown;
  readonly principal?: unknown;
}

/** Decision returned by the engine's access check. @experimental */
export type AgentAccessDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly code: string; readonly message: string };

/**
 * The engine hook the tool bridge calls before every tool execution. Access rules are owned by the
 * engine; the bridge only calls this check and reports a denial to the model.
 * @experimental
 */
export type AgentAccessCheck = (request: AgentAccessRequest) => MaybePromise<AgentAccessDecision>;

/** Outcome of one bridged tool call. @experimental */
export type AgentToolOutcome =
  | { readonly status: "succeeded"; readonly toolCallId: string; readonly output: unknown }
  | {
      readonly status: "failed" | "denied";
      readonly toolCallId: string;
      readonly code: string;
      readonly message: string;
    }
  | { readonly status: "approval-required"; readonly approval: PendingApproval };

/** RelKit-owned bridge from model tool calls to the common engine. @experimental */
export interface AgentToolBridge {
  readonly definitions: readonly AgentToolDefinition[];
  /**
   * Runs one tool call through access checks, approvals and the engine.
   * @param call - Model tool call.
   * @param options - Recorded approval decision and cancellation.
   */
  readonly call: (
    call: AgentToolCall,
    options?: { readonly approval?: ApprovalRecord; readonly signal?: AbortSignal },
  ) => Promise<AgentToolOutcome>;
}

/** Neutral conversation message stored in a thread. @experimental */
export type AgentThreadMessage =
  | { readonly role: "system" | "user"; readonly content: string }
  | {
      readonly role: "assistant";
      readonly content: string;
      readonly toolCalls?: readonly AgentToolCall[];
    }
  | {
      readonly role: "tool";
      readonly toolCallId: string;
      readonly name: string;
      readonly content: string;
    };

/** Durable thread state the adapter loads and saves through state hooks. @experimental */
export interface AgentThreadState {
  readonly threadId: string;
  readonly messages: readonly AgentThreadMessage[];
  /** Tool calls waiting for approval decisions, with the calls still to run after them. */
  readonly pending?: {
    readonly runId: string;
    readonly approvals: readonly PendingApproval[];
    readonly calls: readonly AgentToolCall[];
    readonly steps: number;
    readonly toolCalls: number;
  };
}

/** State persistence hooks backed by the application's `agent-state` profile. @experimental */
export interface AgentStateHooks {
  readonly load: (threadId: string) => MaybePromise<AgentThreadState | undefined>;
  readonly save: (state: AgentThreadState) => MaybePromise<void>;
}

/** Span names an adapter run records. @experimental */
export type AgentTraceSpan = "agent.run" | "agent.model" | "agent.tool";

/** Trace hooks; RelKit's observability implements them, tests record them. @experimental */
export interface AgentTraceHooks {
  readonly start: (
    span: AgentTraceSpan,
    attributes: Readonly<Record<string, string | number | boolean>>,
  ) => { readonly end: (outcome: "ok" | "error") => void };
}

export type * from "./adapter-execution.types.js";
