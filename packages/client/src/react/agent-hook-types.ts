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
} from "./agent-contract-selection.js";
import type { AgentSelector, ClientAgentDynamic } from "./registry.js";
import type {
  AgentNestedExecution,
  AgentObservedEvent,
  AgentToolCall,
  TypedAgentToolCall,
  TypedThreadSnapshot,
  TypedWaitingState,
} from "./agent-hook-contract.js";
export type { AgentOutput } from "./agent-contract-selection.js";
export type { AgentNestedExecution, AgentToolCall } from "./agent-hook-contract.js";

export interface AgentThreadOptions {
  readonly threadId: string;
}

export interface AgentRunOptions extends AgentThreadOptions {
  readonly resume?: false;
}

export interface AgentResumeOptions extends AgentThreadOptions {
  readonly resume: true;
}

export interface AgentStopOptions extends AgentThreadOptions {
  readonly mode?: "graceful" | "immediate";
}

export interface AgentMessage {
  readonly messageId: string;
  readonly runId?: string;
  readonly role: "user" | "assistant";
  readonly parts: readonly Extract<BrowserMessagePart, { readonly kind: "text" }>[];
  readonly createdAt: string;
}

interface AgentProgressBase {
  readonly progressId: string;
  readonly messageId?: string;
  readonly runId?: string;
  readonly value: unknown;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type AgentProgress = AgentProgressBase & import("@relkit/contracts").AgentProgressScope;

export type AgentTimelineItem<Tool = ClientAgentDynamic> =
  | { readonly key: string; readonly kind: "message"; readonly message: AgentMessage }
  | { readonly key: string; readonly kind: "tool"; readonly toolCall: TypedAgentToolCall<Tool> }
  | { readonly key: string; readonly kind: "progress"; readonly progress: AgentProgress };

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

type ResumeRun<Resume> = [Resume] extends [never]
  ? unknown
  : (reply: Resume, options: AgentResumeOptions) => Promise<void>;

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

interface Observation {
  readonly observe: (options: AgentThreadOptions) => Promise<void>;
}

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

type ContractBase<Name extends AgentSelector> = AgentBase<
  AgentOutput<Name>,
  AgentTool<Name>,
  AgentPublicState<Name>,
  AgentCustomEvent<Name>,
  AgentScope<Name>,
  AgentWaiting<Name>
>;
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
