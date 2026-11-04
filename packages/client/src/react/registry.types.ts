import type { ChannelRegistry, AgentRegistry } from "./registry.js";

export type { ClientRouteContract, ClientStreamContract } from "../index.types.js";

export type {
  JobContract,
  JobClientField,
  JobCancelInput,
  JobFor,
  JobGetInput,
  JobListQuery,
  JobListInput,
  JobProcedureSelector,
  JobProcedureContract,
  JobRegistry,
  JobRetryInput,
  JobRunSelector,
  JobSelector,
  JobSnapshotFor,
  JobStreamInput,
  JobStreamProcedureContract,
  JobTriggerInput,
  JobTriggerOptions,
  JobTriggerSelector,
  JobWatchInput,
  SelectedJobField,
} from "../jobs/index.js";

/**
 * Generated channel declaration preserving params, event and presence inference.
 * @typeParam Params - Declared channel parameters.
 * @typeParam Events - Declared named channel event payload map.
 * @typeParam Presence - Declared channel presence payload.
 */
export interface ClientChannelContract<
  Params = unknown,
  Events extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  Presence = never,
> {
  readonly params: Params;
  readonly events: Events;
  readonly presence: Presence;
}

/**
 * Generated agent declaration preserving execution, payload and control capabilities.
 * @typeParam Input - Application-declared request input payload.
 * @typeParam Output - Application-declared successful output payload.
 * @typeParam Controls - Declared agent control capability union.
 * @typeParam Chat - Whether the declared agent supports chat send.
 * @typeParam Resume - Declared continuation input payload.
 * @typeParam Tool - Declared tool identity and input/output contract.
 * @typeParam PublicState - Declared public values exposed by thread observations.
 * @typeParam CustomEvent - Declared custom observation event payload.
 * @typeParam Scope - Declared nested execution scope contract.
 * @typeParam Waiting - Declared supported waiting request union.
 */
export interface ClientAgentContract<
  Input = unknown,
  Output = unknown,
  Controls extends string = never,
  Chat extends boolean = false,
  Resume = never,
  Tool = never,
  PublicState = Readonly<Record<never, never>>,
  CustomEvent = never,
  Scope = ClientAgentDynamic,
  Waiting = never,
> {
  readonly input: Input;
  readonly output: Output;
  readonly controls: Controls;
  readonly chat: Chat;
  readonly resume: Resume;
  readonly tool: Tool;
  readonly publicState: PublicState;
  readonly customEvent: CustomEvent;
  readonly scope: Scope;
  readonly waiting: Waiting;
}

/**
 * Dynamic agent capability marker retaining the existing broad compatibility contract.
 */
export interface ClientAgentDynamic {
  readonly kind: "dynamic";
  readonly data: unknown;
}

/**
 * String keys of the declared channel registry.
 */
export type ChannelSelector = Extract<keyof ChannelRegistry, string>;

/**
 * String keys of the declared agent registry.
 */
export type AgentSelector = Extract<keyof AgentRegistry, string>;

