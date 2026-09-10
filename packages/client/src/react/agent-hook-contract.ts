import type {
  AgentClientEvent,
  AgentExecutionSnapshot,
  AgentToolEvent,
  AgentWaitingRequest,
  AgentWaitingState,
  ThreadSnapshot,
  ToolPartState,
} from "@relkit/contracts";

export interface AgentToolCall {
  readonly toolCallId: string;
  readonly messageId: string;
  readonly partId: string;
  readonly runId?: string;
  readonly toolId: string;
  readonly state: ToolPartState;
  readonly inputText?: string;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly createdAt: string;
  readonly updatedAt: string;
}

type ToolContract = {
  readonly kind: "tool";
  readonly id: string;
  readonly input: unknown;
  readonly output: unknown;
};
export type TypedAgentToolCall<Tool> = Tool extends ToolContract
  ? Omit<AgentToolCall, "toolId" | "input" | "output"> & {
      readonly toolId: Tool["id"];
      readonly input?: Tool["input"];
      readonly output?: Tool["output"];
    }
  : AgentToolCall;

type TypedToolEvent<Event, Tool> = Tool extends ToolContract
  ? Event extends AgentToolEvent
    ? Omit<Event, "toolId" | "input" | "output"> & {
        readonly toolId: Tool["id"];
      } & (Event extends { readonly kind: "tool-input-ready" }
          ? { readonly input: Tool["input"] }
          : Event extends { readonly kind: "tool-succeeded" }
            ? { readonly output: Tool["output"] }
            : {})
    : never
  : Event;
type ObservedCustomEvent<CustomEvent> = CustomEvent & {
  readonly eventId: string;
  readonly recordId: string;
  readonly runId: string;
  readonly createdAt: string;
  readonly scope: readonly string[];
};
export type AgentObservedEvent<Tool, CustomEvent> =
  | Exclude<AgentClientEvent, AgentToolEvent>
  | TypedToolEvent<AgentToolEvent, Tool>
  | ObservedCustomEvent<CustomEvent>;

export type TypedWaitingState<Waiting> = Omit<AgentWaitingState, "requests"> & {
  readonly requests: readonly (Waiting extends AgentWaitingRequest ? Waiting : never)[];
};
type DeclaredScopeId<Scope, Kind extends string> =
  Extract<Scope, { readonly kind: Kind }> extends {
    readonly id: infer Id extends string;
  }
    ? Id
    : never;
type ScopeId<Scope, Kind extends string> =
  | DeclaredScopeId<Scope, Kind>
  | (Extract<Scope, { readonly kind: "dynamic" }> extends never ? never : string);
export type AgentNestedExecution<Scope, PublicState> = Omit<
  AgentExecutionSnapshot,
  "agent" | "node" | "values"
> & {
  readonly agent?: ScopeId<Scope, "agent" | "subagent">;
  readonly node?: ScopeId<Scope, "node">;
  readonly values?: PublicState;
};
export type TypedThreadSnapshot<Output, PublicState, Scope, Waiting> = Omit<
  ThreadSnapshot,
  "executions" | "output" | "values" | "waiting"
> & {
  readonly executions: readonly AgentNestedExecution<Scope, PublicState>[];
  readonly output?: Output;
  readonly values?: PublicState;
  readonly waiting?: [Waiting] extends [never] ? never : TypedWaitingState<Waiting>;
};
