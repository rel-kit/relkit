import type { ClientRegistry, ChannelRegistry, AgentRegistry } from "./registry.js";

/**
 * Generated finite route declaration preserving payload and failure inference.
 * @typeParam Input - Application-declared request input payload.
 * @typeParam Output - Application-declared successful output payload.
 * @typeParam Failure - Declared procedure failure payload.
 */
export interface ClientRouteContract<
  Input = unknown,
  Output = unknown,
  Failure = globalThis.Error,
> {
  readonly input: Input;
  readonly output: Output;
  readonly error: Failure;
  readonly operation: "query" | "mutation";
  readonly stream: false;
}

/**
 * Generated route stream declaration preserving item and failure inference.
 * @typeParam Input - Application-declared request input payload.
 * @typeParam Item - Declared native stream item payload.
 * @typeParam Failure - Declared procedure failure payload.
 */
export interface ClientStreamContract<Input = unknown, Item = unknown, Failure = globalThis.Error> {
  readonly input: Input;
  readonly output: AsyncIterable<Item>;
  readonly item: Item;
  readonly error: Failure;
  readonly operation: "query" | "mutation";
  readonly stream: true;
}

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

/**
 * String keys of the declared procedure registry.
 */
export type ClientSelector = Extract<keyof ClientRegistry, string>;

/**
 * Declared procedure keys whose result is finite.
 */
export type FiniteSelector = {
  [Name in ClientSelector]: ClientRegistry[Name] extends { readonly stream: false } ? Name : never;
}[ClientSelector];

/**
 * Declared finite query procedure keys.
 */
export type QuerySelector = {
  [Name in FiniteSelector]: ClientRegistry[Name] extends { readonly operation: "query" }
    ? Name
    : never;
}[FiniteSelector];

/**
 * Declared finite mutation procedure keys.
 */
export type MutationSelector = {
  [Name in FiniteSelector]: ClientRegistry[Name] extends { readonly operation: "mutation" }
    ? Name
    : never;
}[FiniteSelector];

/**
 * Declared procedure keys whose result is streamed.
 */
export type StreamSelector = {
  [Name in ClientSelector]: ClientRegistry[Name] extends { readonly stream: true } ? Name : never;
}[ClientSelector];

/**
 * Looks up one exact application procedure contract.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
export type ContractFor<Name extends ClientSelector> = ClientRegistry[Name];

/**
 * Infers the input of one exact application procedure.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
export type InputFor<Name extends ClientSelector> =
  ContractFor<Name> extends {
    readonly input: infer Input;
  }
    ? Input
    : never;

/**
 * Infers the successful output of one exact application procedure.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
export type OutputFor<Name extends ClientSelector> =
  ContractFor<Name> extends {
    readonly output: infer Output;
  }
    ? Output
    : never;

/**
 * Infers the declared failure of one exact application procedure.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
export type ErrorFor<Name extends ClientSelector> =
  ContractFor<Name> extends {
    readonly error: infer Error;
  }
    ? Error
    : never;

/**
 * Infers the item payload of one exact application stream.
 * @typeParam Name - Declared registry key selecting the exact application contract.
 */
export type ItemFor<Name extends StreamSelector> =
  ContractFor<Name> extends {
    readonly item: infer Item;
  }
    ? Item
    : never;
