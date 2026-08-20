import {
  createDescriptorBase,
  deepFreeze,
  isDescriptor,
  isStableId,
  normalizeId,
  type DescriptorBase,
  type DescriptorMetadata,
} from "@zsys/contracts";
import type { AgentRef } from "@zsys/functions";
import { type InferInput, type InferOutput, type StandardSchemaV1 } from "@zsys/schema";
import { isToolRef, type ToolRefAny } from "@zsys/tools";
import { copyAgentInstructions, copyAgentTools } from "./define-agent-support.js";

export interface PromptTemplate {
  readonly template: string;
  readonly variables?: readonly string[];
}

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
  readonly modelProfile: string;
  readonly instructions: string | PromptTemplate;
  readonly tools: readonly ToolRefAny[];
  readonly limits: AgentLimits;
}

type AgentAny = AgentDescriptor<string, unknown, unknown>;

export interface DefineAgentOptions<
  Id extends string,
  InputSchema extends StandardSchemaV1,
  OutputSchema extends StandardSchemaV1,
> extends DescriptorMetadata {
  readonly id: Id;
  readonly input: InputSchema;
  readonly output: OutputSchema;
  readonly modelProfile: string;
  readonly instructions: string | PromptTemplate;
  readonly tools: readonly ToolRefAny[];
  readonly limits: AgentLimits;
}

/**
 * Defines an agent contract with bounded tools, model selection, and execution limits.
 *
 * @example
 * ```ts
 * import { defineAgent } from "@zsys/agents"
 * import { z } from "@zsys/schema"
 *
 * const support = defineAgent({ id: "support", input: z.string(), output: z.string(), modelProfile: "default", instructions: "Answer safely.", tools: [], limits: { maxSteps: 4, maxToolCalls: 2, timeoutMs: 30_000 } })
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
  const modelProfile = normalizeId(options.modelProfile);
  const instructions = copyAgentInstructions(options.instructions);
  const tools = copyAgentTools(options.tools);
  const limits = copyLimits(options.limits);
  const base = createDescriptorBase("agent", options.id, options);

  return deepFreeze({
    ...base,
    input: options.input,
    output: options.output,
    modelProfile,
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
    isStableId(descriptor.modelProfile) &&
    isInstructions(descriptor.instructions) &&
    Array.isArray(descriptor.tools) &&
    descriptor.tools.every(isToolRef) &&
    isRecord(descriptor.limits) &&
    isPositiveInteger(descriptor.limits.maxSteps) &&
    isPositiveInteger(descriptor.limits.maxToolCalls) &&
    isPositiveInteger(descriptor.limits.timeoutMs)
  );
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

function isInstructions(value: unknown): value is string | PromptTemplate {
  if (typeof value === "string") return value.trim() !== "";
  if (!isRecord(value) || typeof value.template !== "string" || value.template.trim() === "") {
    return false;
  }
  return (
    value.variables === undefined ||
    (Array.isArray(value.variables) &&
      value.variables.every((entry) => typeof entry === "string" && entry.trim() !== ""))
  );
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
