/** Builds the native execution payload from model, tool and middleware inputs after validation, without starting model execution during authoring. This companion preserves the native input and output types without starting runtime work. */

import type { StateDefinitionInit } from "@langchain/langgraph";
import type { ClientTool, ServerTool } from "@langchain/core/tools";
import type { MaybePromise } from "@relkit/contracts";
import type { ToolRefAny } from "@relkit/tools";
import type { AgentMiddleware as NativeAgentMiddleware, InferSchemaValue } from "langchain";

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

/** SDK fields RELKIT inspects; each descriptor retains its complete inferred middleware tuple, including native hooks, tools and phantom schema data. Runtime validation checks the SDK brand. */
export type AgentMiddleware = Pick<NativeAgentMiddleware, "name" | "stateSchema">;

/** Public state composed from middleware state schemas. */
export type AgentMiddlewareState<Middleware extends readonly AgentMiddleware[]> =
  Middleware extends readonly [infer First, ...infer Rest]
    ? First extends AgentMiddleware
      ? Rest extends readonly AgentMiddleware[]
        ? MiddlewareState<First> & AgentMiddlewareState<Rest>
        : MiddlewareState<First>
      : {}
    : {};

type MiddlewareState<Middleware> = Middleware extends { readonly stateSchema?: infer Schema }
  ? PublicState<MiddlewareSchemaState<Exclude<Schema, undefined>>>
  : {};

// SDK todo middleware publishes Zod v3 schemas; retain their concrete output even
// when the selected LangGraph declaration's interop union accepts only newer Zod.
type MiddlewareSchemaState<Schema> = Schema extends { readonly _output: infer Output }
  ? Output
  : InferSchemaValue<Extract<Schema, StateDefinitionInit>>;

type PublicState<State> = {
  [Key in keyof State as Key extends `_${string}` ? never : Key]: State[Key];
};

type MiddlewareStateKey<Middleware> = Middleware extends AgentMiddleware
  ? [Exclude<Middleware["stateSchema"], undefined>] extends [never]
    ? never
    : unknown extends Middleware["stateSchema"]
      ? string
      : Extract<keyof MiddlewareState<Middleware>, string>
  : never;

/** Public state keys selected from each middleware schema without erasing tuples. */
export type AgentClientStateKey<Middleware extends readonly AgentMiddleware[]> = MiddlewareStateKey<
  Middleware[number]
>;
