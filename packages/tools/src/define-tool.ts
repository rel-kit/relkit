import {
  createDescriptorBase,
  deepFreeze,
  isDescriptor,
  isRef,
  type DescriptorBase,
  type DescriptorMetadata,
} from "@zsys/contracts";
import {
  isErrorDescriptor,
  type ErrorDescriptorAny,
  type FunctionRef,
  type FunctionRefAny,
} from "@zsys/functions";

export type ToolSideEffect = "none" | "read" | "write" | "external";
export type ToolApproval = "never" | "on-write" | "always";

export interface ToolRef<Id extends string = string> {
  readonly ref: {
    readonly kind: "tool";
    readonly id: Id;
  };
}

export type ToolRefAny = ToolRef;

export type ToolTarget<Target extends FunctionRefAny> = FunctionRef<
  Target["ref"]["id"],
  Target extends { readonly __input?: infer Input } ? Input : unknown,
  Target extends { readonly __output?: infer Output } ? Output : unknown,
  TargetErrors<Target>,
  Target["input"],
  Target["output"]
>;

export interface ToolDescriptor<Id extends string, Target extends FunctionRefAny = FunctionRefAny>
  extends DescriptorBase<"tool", Id>, ToolRef<Id> {
  readonly target: ToolTarget<Target>;
  readonly description: string;
  readonly sideEffect: ToolSideEffect;
  readonly approval: ToolApproval;
  readonly timeoutMs?: number;
}

export interface DefineToolOptions<
  Id extends string,
  Target extends FunctionRefAny,
> extends DescriptorMetadata {
  readonly id: Id;
  readonly target: Target;
  readonly description: string;
  readonly sideEffect: ToolSideEffect;
  readonly approval: ToolApproval;
  readonly timeoutMs?: number;
}

/**
 * Defines a tool boundary with side-effect and approval metadata for safe invocation.
 *
 * @example
 * ```ts
 * import { defineFunction } from "@zsys/functions"
 * import { z } from "@zsys/schema"
 * import { defineTool } from "@zsys/tools"
 *
 * const target = defineFunction({ id: "lookup", input: z.string(), output: z.string(), handler: async (id) => id })
 * const tool = defineTool({ id: "lookup", target, description: "Look up an order", sideEffect: "read", approval: "never" })
 * void tool
 * ```
 * @category Tools
 * @since 0.1.0
 */
export function defineTool<const Id extends string, const Target extends FunctionRefAny>(
  options: DefineToolOptions<Id, Target>,
): ToolDescriptor<Id, Target> {
  if (!isRecord(options)) throw new TypeError("Tool options must be an object");
  if (hasOwn(options, "handler")) throw new TypeError("Tools cannot own handlers");
  const target = copyFunctionTarget(options.target);
  const description = requiredText(options.description, "Tool description");
  const sideEffect = validateSideEffect(options.sideEffect);
  const approval = validateApproval(options.approval);
  if (options.timeoutMs !== undefined) positiveInteger(options.timeoutMs, "timeoutMs");
  const base = createDescriptorBase("tool", options.id, options);

  return deepFreeze({
    ...base,
    target,
    description,
    sideEffect,
    approval,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  }) as ToolDescriptor<Id, Target>;
}

export function isToolDescriptor(value: unknown): value is ToolDescriptor<string> {
  if (!isRecord(value) || hasOwn(value, "handler") || !isDescriptor(value, "tool")) {
    return false;
  }
  const descriptor = value as ToolDescriptor<string>;
  return (
    isFunctionTarget(descriptor.target) &&
    isNonEmptyString(descriptor.description) &&
    isToolSideEffect(descriptor.sideEffect) &&
    isToolApproval(descriptor.approval) &&
    (descriptor.timeoutMs === undefined || isPositiveInteger(descriptor.timeoutMs))
  );
}

export function assertToolDescriptor(value: unknown): asserts value is ToolDescriptor<string> {
  if (!isToolDescriptor(value)) throw new TypeError("Invalid tool descriptor");
}

export function isToolRef(value: unknown): value is ToolRefAny {
  return isRecord(value) && isRef(value.ref, "tool");
}

function copyFunctionTarget<Target extends FunctionRefAny>(target: Target): ToolTarget<Target> {
  if (!isFunctionTarget(target)) throw new TypeError("Tool target must be a function reference");
  return deepFreeze({
    ref: Object.freeze({ kind: "function" as const, id: target.ref.id }),
    input: target.input,
    output: target.output,
    ...(target.errors === undefined ? {} : { errors: Object.freeze([...target.errors]) }),
  }) as ToolTarget<Target>;
}

function validateSideEffect(value: unknown): ToolSideEffect {
  if (!isToolSideEffect(value)) {
    throw new TypeError("Tool sideEffect must be none, read, write, or external");
  }
  return value;
}

function validateApproval(value: unknown): ToolApproval {
  if (!isToolApproval(value)) {
    throw new TypeError("Tool approval must be never, on-write, or always");
  }
  return value;
}

function isToolSideEffect(value: unknown): value is ToolSideEffect {
  return value === "none" || value === "read" || value === "write" || value === "external";
}

function isToolApproval(value: unknown): value is ToolApproval {
  return value === "never" || value === "on-write" || value === "always";
}

function requiredText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is required`);
  return value.trim();
}

function positiveInteger(value: unknown, name: string): asserts value is number {
  if (!isPositiveInteger(value)) throw new TypeError(`${name} must be a positive integer`);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isFunctionTarget(value: unknown): value is FunctionRefAny {
  return (
    isRecord(value) &&
    isRef(value.ref, "function") &&
    isSchema(value.input) &&
    isSchema(value.output) &&
    (!hasOwn(value, "handler") || typeof value.handler === "function") &&
    (value.errors === undefined ||
      (Array.isArray(value.errors) && value.errors.every(isErrorDescriptor)))
  );
}

function isSchema(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value["~standard"])) return false;
  return value["~standard"].version === 1 && typeof value["~standard"].validate === "function";
}

type TargetErrors<Target extends FunctionRefAny> =
  NonNullable<Target["errors"]> extends readonly ErrorDescriptorAny[]
    ? NonNullable<Target["errors"]>
    : readonly ErrorDescriptorAny[];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isRecord(value: unknown): value is Record<PropertyKey, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
