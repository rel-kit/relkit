import type { AgentWaitingRequest, BrowserMessagePart, ThreadSnapshot } from "@relkit/contracts";
import type {
  AgentChat,
  AgentControls,
  AgentCustomEvent,
  AgentInput,
  AgentOutput,
  AgentPublicState,
  AgentResume,
  AgentScope,
  AgentTool,
  AgentWaiting,
} from "./agent-contract-selection.types.js";
import type { AgentSelector, ClientAgentDynamic } from "./registry.types.js";
import type {
  AgentNestedExecution,
  AgentObservedEvent,
  TypedAgentToolCall,
  TypedThreadSnapshot,
  TypedWaitingState,
} from "./agent-hook-contract.types.js";

export type { AgentOutput } from "./agent-contract-selection.types.js";

export type { AgentNestedExecution, AgentToolCall } from "./agent-hook-contract.types.js";

/**
 * Caller-owned durable thread identity used by observation and controls.
 */
export interface AgentThreadOptions {
  readonly threadId: string;
}

/**
 * Fresh run options excluding continuation mode.
 */
export interface AgentRunOptions extends AgentThreadOptions {
  readonly resume?: false;
}

/**
 * Continuation options requiring explicit resume mode.
 */
export interface AgentResumeOptions extends AgentThreadOptions {
  readonly resume: true;
}

/**
 * Durable thread stop policy preserving graceful and immediate alternatives.
 */
export interface AgentStopOptions extends AgentThreadOptions {
  readonly mode?: "graceful" | "immediate";
}

/**
 * Browser projection of canonical user or assistant text message parts.
 */
export interface AgentMessage {
  readonly messageId: string;
  readonly runId?: string;
  readonly role: "user" | "assistant";
  readonly parts: readonly Extract<BrowserMessagePart, { readonly kind: "text" }>[];
  readonly createdAt: string;
}

/**
 * Stable progress identity and timestamps before applying canonical scope.
 */
interface AgentProgressBase {
  readonly progressId: string;
  readonly messageId?: string;
  readonly runId?: string;
  readonly value: unknown;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Browser progress projection with its canonical run or tool scope.
 */
export type AgentProgress = AgentProgressBase & import("@relkit/contracts").AgentProgressScope;

/**
 * Ordered browser timeline member retaining stable message, tool and progress identity.
 * @typeParam Tool - Declared tool identity and input/output contract.
 */
export type AgentTimelineItem<Tool = ClientAgentDynamic> =
  | { readonly key: string; readonly kind: "message"; readonly message: AgentMessage }
  | { readonly key: string; readonly kind: "tool"; readonly toolCall: TypedAgentToolCall<Tool> }
  | { readonly key: string; readonly kind: "progress"; readonly progress: AgentProgress };

/**
 * Indexed browser content supporting ordered timeline and direct identity lookup.
 * @typeParam Tool - Declared tool identity and input/output contract.
 */
export interface AgentContent<Tool = ClientAgentDynamic> {
  readonly timeline: readonly AgentTimelineItem<Tool>[];
  readonly timelineById: ReadonlyMap<string, AgentTimelineItem<Tool>>;
  readonly messages: readonly AgentMessage[];
  readonly messagesById: ReadonlyMap<string, AgentMessage>;
  readonly toolCalls: readonly TypedAgentToolCall<Tool>[];
  readonly toolCallsById: ReadonlyMap<string, TypedAgentToolCall<Tool>>;
  readonly progress: readonly AgentProgress[];
  readonly progressById: ReadonlyMap<string, AgentProgress>;
}

/**
 * Observed durable thread state with declaration-derived payload and control contracts.
 * @typeParam Output - Application-declared successful output payload.
 * @typeParam Tool - Declared tool identity and input/output contract.
 * @typeParam PublicState - Declared public values exposed by thread observations.
 * @typeParam CustomEvent - Declared custom observation event payload.
 * @typeParam Scope - Declared nested execution scope contract.
 * @typeParam Waiting - Declared supported waiting request union.
 */
export interface AgentBase<
  Output,
  Tool = ClientAgentDynamic,
  PublicState = unknown,
  CustomEvent = never,
  Scope = ClientAgentDynamic,
  Waiting = AgentWaitingRequest,
> extends AgentContent<Tool> {
  readonly status:
    | "idle"
    | "loading"
    | "running"
    | "waiting"
    | "approval-interrupted"
    | "stopping"
    | "worker-interrupted"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "error";
  readonly threadId?: string;
  readonly events: readonly AgentObservedEvent<Tool, CustomEvent>[];
  readonly values?: PublicState;
  readonly executions: readonly AgentNestedExecution<Scope, PublicState>[];
  readonly output?: Output;
  readonly snapshot?: ThreadSnapshot;
  readonly waiting?: ([Waiting] extends [never] ? never : TypedWaitingState<Waiting>) | undefined;
  readonly error?: unknown;
}

/**
 * Adds a continuation signature only when a resume payload is declared.
 * @typeParam Resume - Declared continuation input payload.
 */
type ResumeRun<Resume> = [Resume] extends [never]
  ? unknown
  : (reply: Resume, options: AgentResumeOptions) => Promise<void>;

/**
 * Chooses chat send or typed run signatures from the declared agent contract.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
type Execution<Name extends AgentSelector> =
  AgentChat<Name> extends true
    ? { readonly send: (message: string, options: AgentRunOptions) => Promise<void> } & ([
        AgentResume<Name>,
      ] extends [never]
        ? {}
        : { readonly run: ResumeRun<AgentResume<Name>> })
    : {
        readonly run: ((input: AgentInput<Name>, options: AgentRunOptions) => Promise<void>) &
          ResumeRun<AgentResume<Name>>;
      };

/**
 * Durable thread observation signature shared by all agent hooks.
 */
interface Observation {
  readonly observe: (options: AgentThreadOptions) => Promise<void>;
}

/**
 * Includes only controls exposed by the declared agent contract.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
type Controls<Name extends AgentSelector> = ("steer" extends AgentControls<Name>
  ? { readonly steer: (message: string, options: AgentThreadOptions) => Promise<void> }
  : {}) &
  ("follow-up" extends AgentControls<Name>
    ? { readonly followUp: (message: string, options: AgentThreadOptions) => Promise<void> }
    : {}) &
  ("stop" extends AgentControls<Name>
    ? { readonly stop: (options: AgentStopOptions) => Promise<void> }
    : {}) &
  ("approve" extends AgentControls<Name>
    ? {
        readonly approve: (approvalId: string, options: AgentThreadOptions) => Promise<void>;
        readonly deny: (approvalId: string, options: AgentThreadOptions) => Promise<void>;
      }
    : {});

/**
 * Instantiates observed thread payloads from one declared agent contract.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
type ContractBase<Name extends AgentSelector> = AgentBase<
  AgentOutput<Name>,
  AgentTool<Name>,
  AgentPublicState<Name>,
  AgentCustomEvent<Name>,
  AgentScope<Name>,
  AgentWaiting<Name>
>;

/**
 * Public agent hook state and declaration-derived execution, observation and controls.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
export type UseAgentResult<Name extends AgentSelector> = Omit<ContractBase<Name>, "snapshot"> & {
  readonly snapshot?: TypedThreadSnapshot<
    AgentOutput<Name>,
    AgentPublicState<Name>,
    AgentScope<Name>,
    AgentWaiting<Name>
  >;
} & Execution<Name> &
  Observation &
  Controls<Name>;
