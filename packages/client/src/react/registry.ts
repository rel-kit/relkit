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

export interface ClientStreamContract<Input = unknown, Item = unknown, Failure = globalThis.Error> {
  readonly input: Input;
  readonly output: AsyncIterable<Item>;
  readonly item: Item;
  readonly error: Failure;
  readonly operation: "query" | "mutation";
  readonly stream: true;
}

export interface ClientRegistry {}

export interface ClientChannelContract<
  Params = unknown,
  Events extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  Presence = never,
> {
  readonly params: Params;
  readonly events: Events;
  readonly presence: Presence;
}

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

export interface ClientAgentDynamic {
  readonly kind: "dynamic";
  readonly data: unknown;
}

export interface ChannelRegistry {}
export interface AgentRegistry {}

export type ChannelSelector = Extract<keyof ChannelRegistry, string>;
export type AgentSelector = Extract<keyof AgentRegistry, string>;

export type ClientSelector = Extract<keyof ClientRegistry, string>;
export type FiniteSelector = {
  [Name in ClientSelector]: ClientRegistry[Name] extends { readonly stream: false } ? Name : never;
}[ClientSelector];
export type QuerySelector = {
  [Name in FiniteSelector]: ClientRegistry[Name] extends { readonly operation: "query" }
    ? Name
    : never;
}[FiniteSelector];
export type MutationSelector = {
  [Name in FiniteSelector]: ClientRegistry[Name] extends { readonly operation: "mutation" }
    ? Name
    : never;
}[FiniteSelector];
export type StreamSelector = {
  [Name in ClientSelector]: ClientRegistry[Name] extends { readonly stream: true } ? Name : never;
}[ClientSelector];

export type ContractFor<Name extends ClientSelector> = ClientRegistry[Name];
export type InputFor<Name extends ClientSelector> =
  ContractFor<Name> extends {
    readonly input: infer Input;
  }
    ? Input
    : never;
export type OutputFor<Name extends ClientSelector> =
  ContractFor<Name> extends {
    readonly output: infer Output;
  }
    ? Output
    : never;
export type ErrorFor<Name extends ClientSelector> =
  ContractFor<Name> extends {
    readonly error: infer Error;
  }
    ? Error
    : never;
export type ItemFor<Name extends StreamSelector> =
  ContractFor<Name> extends {
    readonly item: infer Item;
  }
    ? Item
    : never;
