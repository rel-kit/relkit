import type {
  AgentClientEvent,
  AgentExecutionSnapshot,
  AgentToolEvent,
  AgentWaitingRequest,
  AgentWaitingState,
  ThreadSnapshot,
  ToolPartState,
} from "@relkit/contracts";

/**
 * Stable browser projection of canonical tool identity, state, input and output.
 */
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

/**
 * Minimal tool declaration used to infer observed tool payloads.
 */
type ToolContract = {
  readonly kind: "tool";
  readonly id: string;
  readonly input: unknown;
  readonly output: unknown;
};

/**
 * Specializes observed tool identity and payloads when a tool contract is declared.
 * @typeParam Tool - Declared tool identity and input/output contract.
 */
export type TypedAgentToolCall<Tool> = Tool extends ToolContract
  ? Omit<AgentToolCall, "toolId" | "input" | "output"> & {
      readonly toolId: Tool["id"];
      readonly input?: Tool["input"];
      readonly output?: Tool["output"];
    }
  : AgentToolCall;

/**
 * Specializes canonical tool events with declaration-derived tool payloads.
 * @typeParam Event - Canonical tool event being specialized.
 * @typeParam Tool - Declared tool identity and input/output contract.
 */
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

/**
 * Adds canonical journal identity and scope to a declared custom event.
 * @typeParam CustomEvent - Declared custom observation event payload.
 */
type ObservedCustomEvent<CustomEvent> = CustomEvent & {
  readonly eventId: string;
  readonly recordId: string;
  readonly runId: string;
  readonly createdAt: string;
  readonly scope: readonly string[];
};

/**
 * Canonical observed events with declared tool and custom payload inference.
 * @typeParam Tool - Declared tool identity and input/output contract.
 * @typeParam CustomEvent - Declared custom observation event payload.
 */
export type AgentObservedEvent<Tool, CustomEvent> =
  | Exclude<AgentClientEvent, AgentToolEvent>
  | TypedToolEvent<AgentToolEvent, Tool>
  | ObservedCustomEvent<CustomEvent>;

/**
 * Projects waiting requests using the declared supported waiting union.
 * @typeParam Waiting - Declared supported waiting request union.
 */
export type TypedWaitingState<Waiting> = Omit<AgentWaitingState, "requests"> & {
  readonly requests: readonly (Waiting extends AgentWaitingRequest ? Waiting : never)[];
};

/**
 * Extracts declared nested execution identity for one scope kind.
 * @typeParam Scope - Declared nested execution scope contract.
 * @typeParam Kind - Nested execution scope discriminator.
 */
type DeclaredScopeId<Scope, Kind extends string> =
  Extract<Scope, { readonly kind: Kind }> extends {
    readonly id: infer Id extends string;
  }
    ? Id
    : never;

/**
 * Adds dynamic scope identity only when the contract declares dynamic execution.
 * @typeParam Scope - Declared nested execution scope contract.
 * @typeParam Kind - Nested execution scope discriminator.
 */
type ScopeId<Scope, Kind extends string> =
  | DeclaredScopeId<Scope, Kind>
  | (Extract<Scope, { readonly kind: "dynamic" }> extends never ? never : string);

/**
 * Projects nested execution identity and public values from the declared scope.
 * @typeParam Scope - Declared nested execution scope contract.
 * @typeParam PublicState - Declared public values exposed by thread observations.
 */
export type AgentNestedExecution<Scope, PublicState> = Omit<
  AgentExecutionSnapshot,
  "agent" | "node" | "values"
> & {
  readonly agent?: ScopeId<Scope, "agent" | "subagent">;
  readonly node?: ScopeId<Scope, "node">;
  readonly values?: PublicState;
};

/**
 * Authoritative thread snapshot with declaration-derived output, scope, values and waiting requests.
 * @typeParam Output - Application-declared successful output payload.
 * @typeParam PublicState - Declared public values exposed by thread observations.
 * @typeParam Scope - Declared nested execution scope contract.
 * @typeParam Waiting - Declared supported waiting request union.
 */
export type TypedThreadSnapshot<Output, PublicState, Scope, Waiting> = Omit<
  ThreadSnapshot,
  "executions" | "output" | "values" | "waiting"
> & {
  readonly executions: readonly AgentNestedExecution<Scope, PublicState>[];
  readonly output?: Output;
  readonly values?: PublicState;
  readonly waiting?: [Waiting] extends [never] ? never : TypedWaitingState<Waiting>;
};
