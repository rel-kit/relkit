import {
  createDescriptorBase,
  deepFreeze,
  isDescriptor,
  type DescriptorBase,
  type DescriptorMetadata,
} from "@relkit/contracts";
import { createUnboundIdentity } from "@relkit/invocation";
import type { AgentRef } from "@relkit/functions";
import { type InferInput, type InferOutput, type StandardSchemaV1 } from "@relkit/schema";
import { isToolRef, type ToolRefAny } from "@relkit/tools";
import {
  copyAgentInstructions,
  copyAgentTools,
  isAgentInstructions,
} from "./define-agent-support.js";
import { normalizeModelSelector } from "./model-selection.js";

export interface PromptTemplate {
  readonly template: string;
  readonly variables?: readonly string[];
}

export interface PromptInstructions {
  readonly kind: "prompt";
  readonly id: string;
  readonly ref: { readonly kind: "prompt"; readonly id: string };
  readonly value: string | readonly string[];
}

export type AgentInstructions = string | PromptTemplate | PromptInstructions;

export interface AgentLimits {
  readonly maxSteps: number;
  readonly maxToolCalls: number;
  readonly timeoutMs: number;
}

export interface AgentDescriptor<
  Id extends string,
  Input,
  Output,
  InputSchema extends StandardSchemaV1 = StandardSchemaV1,
  OutputSchema extends StandardSchemaV1 = StandardSchemaV1,
>
  extends DescriptorBase<"agent", Id>, AgentRef<Id, InputSchema, OutputSchema> {
  readonly model?: string;
  readonly instructions: AgentInstructions;
  readonly tools: readonly ToolRefAny[];
  readonly limits: AgentLimits;
}

type AgentAny = AgentDescriptor<string, unknown, unknown>;

export interface DefineAgentOptions<
  Id extends string,
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
> extends DescriptorMetadata {
  readonly id?: Id;
  readonly input: InputSchema;
  readonly output: OutputSchema;
  readonly model?: string;
  readonly instructions: AgentInstructions;
  readonly tools: readonly ToolRefAny[];
  readonly limits: AgentLimits;
}

/**
 * Defines an agent contract with bounded tools, an optional serializable AI SDK
 * model selector, and execution limits. Omitted `model` uses the active provider
 * defaults; a provider name selects that provider's default model and
 * `provider:model` selects an exact registry model. Credentials and live model
 * objects belong in environment provider configuration, never in this descriptor.
 *
 * @example
 * ```ts
 * import { defineAgent } from "@relkit/app/agents"
 * import { z } from "@relkit/app/schema"
 *
 * const support = defineAgent({ id: "support", input: z.string(), output: z.string(), instructions: "Answer safely.", tools: [], limits: { maxSteps: 4, maxToolCalls: 2, timeoutMs: 30_000 } })
 * void support
 * ```
 * @category Agents
 * @since 0.1.0
 */
export function defineAgent<
  const Id extends string,
  const InputSchema extends StandardSchemaV1,
  const OutputSchema extends StandardSchemaV1,
>(
  options: DefineAgentOptions<Id, InputSchema, OutputSchema>,
): AgentDescriptor<
  Id,
  InferInput<InputSchema>,
  InferOutput<OutputSchema>,
  InputSchema,
  OutputSchema
> {
  if (!isRecord(options)) throw new TypeError("Agent options must be an object");
  if (hasOwn(options, "handler")) throw new TypeError("Agents cannot own handlers");
  assertSchema(options.input, "input");
  assertSchema(options.output, "output");
  const model = normalizeModelSelector(options.model);
  const instructions = copyAgentInstructions(options.instructions);
  const tools = copyAgentTools(options.tools);
  const limits = copyLimits(options.limits);
  const id = (options.id === undefined ? createUnboundIdentity() : options.id) as Id;
  const base = createDescriptorBase("agent", id, options);

  return deepFreeze({
    ...base,
    input: options.input,
    output: options.output,
    ...(model === undefined ? {} : { model }),
    instructions,
    tools,
    limits,
  }) as AgentDescriptor<
    Id,
    InferInput<InputSchema>,
    InferOutput<OutputSchema>,
    InputSchema,
    OutputSchema
  >;
}

export function isAgentDescriptor(value: unknown): value is AgentAny {
  if (!isRecord(value) || hasOwn(value, "handler") || !isDescriptor(value, "agent")) {
    return false;
  }
  const descriptor = value as AgentDescriptor<string, unknown, unknown>;
  return (
    isSchema(descriptor.input) &&
    isSchema(descriptor.output) &&
    isModelSelector(descriptor.model) &&
    isAgentInstructions(descriptor.instructions) &&
    Array.isArray(descriptor.tools) &&
    descriptor.tools.every(isToolRef) &&
    isRecord(descriptor.limits) &&
    isPositiveInteger(descriptor.limits.maxSteps) &&
    isPositiveInteger(descriptor.limits.maxToolCalls) &&
    isPositiveInteger(descriptor.limits.timeoutMs)
  );
}

function isModelSelector(value: unknown): value is string | undefined {
  try {
    return normalizeModelSelector(value) === value;
  } catch {
    return false;
  }
}

export function assertAgentDescriptor(value: unknown): asserts value is AgentAny {
  if (!isAgentDescriptor(value)) throw new TypeError("Invalid agent descriptor");
}

function copyLimits(value: unknown): AgentLimits {
  if (!isRecord(value)) throw new TypeError("Agent limits must be an object");
  return Object.freeze({
    maxSteps: positiveInteger(value.maxSteps, "limits.maxSteps"),
    maxToolCalls: positiveInteger(value.maxToolCalls, "limits.maxToolCalls"),
    timeoutMs: positiveInteger(value.timeoutMs, "limits.timeoutMs"),
  });
}

function assertSchema(value: unknown, name: string): asserts value is StandardSchemaV1 {
  if (!isSchema(value)) throw new TypeError(`Agent ${name} must be a Standard Schema v1 validator`);
}

function isSchema(value: unknown): value is StandardSchemaV1 {
  if (!isRecord(value) || !isRecord(value["~standard"])) return false;
  return value["~standard"].version === 1 && typeof value["~standard"].validate === "function";
}

function positiveInteger(value: unknown, name: string): number {
  if (!isPositiveInteger(value)) throw new TypeError(`${name} must be a finite positive integer`);
  return value;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isRecord(value: unknown): value is Record<PropertyKey, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
