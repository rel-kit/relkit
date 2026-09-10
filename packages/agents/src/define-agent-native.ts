import { isLangChainTool } from "@langchain/core/tools";
import { MIDDLEWARE_BRAND, type InferMiddlewareSchema, type InferSchemaValue } from "langchain";
import type { StateDefinitionInit } from "@langchain/langgraph";
import type { ClientTool, ServerTool } from "@langchain/core/tools";
import type { MaybePromise } from "@relkit/contracts";
import { isToolRef, type ToolRefAny } from "@relkit/tools";

export interface AgentLanguageModel {
  readonly invoke: (...args: never[]) => unknown;
}
export type AgentModelFactory<Environment = Readonly<Record<string, unknown>>> = (
  environment: Environment,
) => MaybePromise<AgentLanguageModel>;

export type AgentModel = string | AgentLanguageModel | AgentModelFactory;
export type NativeAgentTool = ClientTool | ServerTool;
export type AgentTool = ToolRefAny | NativeAgentTool;
export interface AgentMiddleware {
  readonly [MIDDLEWARE_BRAND]: true;
  readonly name: string;
  readonly stateSchema?: unknown;
  readonly tools?: readonly unknown[];
}

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

export type AgentClientStateKey<Middleware extends readonly AgentMiddleware[]> = Extract<
  keyof AgentMiddlewareState<Middleware>,
  string
>;

export function isAgentModel(value: unknown): value is AgentModel {
  return (
    typeof value === "string" ||
    typeof value === "function" ||
    (isRecord(value) && typeof value.invoke === "function")
  );
}

export function copyAgentMiddleware<Middleware extends readonly AgentMiddleware[]>(
  value: Middleware | undefined,
): Middleware {
  if (value === undefined) return Object.freeze([]) as unknown as Middleware;
  if (!Array.isArray(value)) throw new TypeError("Agent middleware must be an array");
  const names = new Set<string>();
  for (const [index, middleware] of value.entries()) {
    if (!isAgentMiddleware(middleware)) {
      throw new TypeError(`Agent middleware at index ${index} is invalid`);
    }
    if (names.has(middleware.name)) {
      throw new TypeError(`Duplicate agent middleware "${middleware.name}"`);
    }
    names.add(middleware.name);
  }
  return Object.freeze([...value]) as unknown as Middleware;
}

export function copyAgentTools<Tools extends readonly AgentTool[]>(value: Tools): Tools {
  if (!Array.isArray(value)) throw new TypeError("Agent tools must be an array");
  const ids = new Set<string>();
  const tools = value.map((entry, index) => {
    if (isToolRef(entry)) {
      const id = entry.ref.id;
      duplicate(ids, id);
      return Object.freeze({ ref: Object.freeze({ kind: "tool" as const, id }) });
    }
    if (!isNativeAgentTool(entry)) {
      throw new TypeError(`Agent tool at index ${index} is invalid`);
    }
    const name = nativeToolName(entry);
    if (name !== undefined) duplicate(ids, name);
    return entry;
  });
  return Object.freeze(tools) as unknown as Tools;
}

export function middlewareStateKeys<Middleware extends readonly AgentMiddleware[]>(
  middleware: Middleware,
): ReadonlySet<AgentClientStateKey<Middleware>> {
  const keys = new Set<string>();
  for (const entry of middleware) {
    const schema = entry.stateSchema as unknown;
    if (!isRecord(schema)) continue;
    const fields = schema.fields;
    if (isRecord(fields)) for (const key of Object.keys(fields)) keys.add(key);
    const shape = typeof schema.shape === "function" ? schema.shape() : schema.shape;
    if (isRecord(shape)) for (const key of Object.keys(shape)) keys.add(key);
  }
  return keys as unknown as ReadonlySet<AgentClientStateKey<Middleware>>;
}

export function relkitToolRefs(tools: readonly AgentTool[]): readonly ToolRefAny[] {
  return tools.filter(isToolRef);
}

function isAgentMiddleware(value: unknown): value is AgentMiddleware {
  return (
    isRecord(value) &&
    value[MIDDLEWARE_BRAND] === true &&
    typeof value.name === "string" &&
    value.name.trim() !== ""
  );
}

function isNativeAgentTool(value: unknown): value is NativeAgentTool {
  return isLangChainTool(value) || (isRecord(value) && typeof value.type === "string");
}

function nativeToolName(value: NativeAgentTool): string | undefined {
  return "name" in value && typeof value.name === "string" ? value.name : undefined;
}

function duplicate(ids: Set<string>, id: string): void {
  if (ids.has(id)) throw new TypeError(`Duplicate agent tool "${id}"`);
  ids.add(id);
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
