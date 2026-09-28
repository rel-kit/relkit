import type { StateDefinitionInit } from "@langchain/langgraph";
import type { ClientTool, ServerTool } from "@langchain/core/tools";
import type { MaybePromise } from "@relkit/contracts";
import type { ToolRefAny } from "@relkit/tools";
import type { MIDDLEWARE_BRAND, InferMiddlewareSchema, InferSchemaValue } from "langchain";

/** Native model object accepted by an agent descriptor. */
export interface AgentLanguageModel {
  readonly invoke: (...args: never[]) => unknown;
}

/** Environment-bound factory for a native model. */
export type AgentModelFactory<Environment = Readonly<Record<string, unknown>>> = (
  environment: Environment,
) => MaybePromise<AgentLanguageModel>;

/** Model selector, native model, or model factory. */
export type AgentModel = string | AgentLanguageModel | AgentModelFactory;

/** LangChain client or server tool. */
export type NativeAgentTool = ClientTool | ServerTool;

/** RELKIT reference or native LangChain tool. */
export type AgentTool = ToolRefAny | NativeAgentTool;

/** Middleware contract needed by the agent authoring API. */
export interface AgentMiddleware {
  readonly [MIDDLEWARE_BRAND]: true;
  readonly name: string;
  readonly stateSchema?: unknown;
  readonly tools?: readonly unknown[];
}

/** Public state composed from middleware state schemas. */
export type AgentMiddlewareState<Middleware extends readonly AgentMiddleware[]> =
  Middleware extends readonly [infer First, ...infer Rest]
    ? First extends AgentMiddleware
      ? Rest extends readonly AgentMiddleware[]
        ? MiddlewareState<First> & AgentMiddlewareState<Rest>
        : MiddlewareState<First>
      : {}
    : {};

type MiddlewareState<Middleware> =
  InferMiddlewareSchema<Middleware> extends infer Schema
    ? Schema extends StateDefinitionInit
      ? PublicState<InferSchemaValue<Schema>>
      : {}
    : {};

type PublicState<State> = {
  [Key in keyof State as Key extends `_${string}` ? never : Key]: State[Key];
};

/** Public state keys selected from middleware schemas. */
export type AgentClientStateKey<Middleware extends readonly AgentMiddleware[]> = Extract<
  keyof AgentMiddlewareState<Middleware>,
  string
>;
