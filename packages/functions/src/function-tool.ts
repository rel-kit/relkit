import {
  createDescriptorBase,
  deepFreeze,
  isStableId,
  isRef,
  type MaybePromise,
  type DescriptorBase,
  type DescriptorMetadata,
} from "@zsys/contracts";
import { createUnboundIdentity, resolveDescriptorIdentity } from "@zsys/invocation";
import { type InferInput, type InferOutput } from "@zsys/schema";
import type { ErrorDescriptorAny } from "./define-error.js";
import type { FunctionRef, FunctionRefAny } from "./types.js";
import { createFunctionToolInvoker } from "./function-tool-runtime.js";

export type FunctionToolSideEffect = "none" | "read" | "write" | "external";
export type FunctionToolApproval = "never" | "on-write" | "always";

export interface FunctionToolMetadata extends DescriptorMetadata {
  readonly description: string;
  readonly sideEffect: FunctionToolSideEffect;
  readonly approval: FunctionToolApproval;
  readonly timeoutMs?: number;
}

export interface FunctionToolOptions<Id extends string = string> extends FunctionToolMetadata {
  readonly id?: Id;
}

export interface FunctionToolApprovalRequest {
  readonly toolId: string;
  readonly sideEffect: FunctionToolSideEffect;
  readonly policy: FunctionToolApproval;
}

export type FunctionToolApprovalDecision = "approved" | "denied" | boolean;

export type FunctionToolApprovalResolver = (
  approval: FunctionToolApprovalRequest,
) => MaybePromise<FunctionToolApprovalDecision>;

export interface FunctionToolInvokeOptions {
  readonly signal?: AbortSignal;
  readonly approval?: FunctionToolApprovalResolver;
}

export type FunctionToolTarget<Target extends FunctionRefAny> = FunctionRef<
  Target["ref"]["id"],
  Target extends { readonly __input?: infer Input } ? Input : unknown,
  Target extends { readonly __output?: infer Output } ? Output : unknown,
  TargetErrors<Target>,
  Target["input"],
  Target["output"]
>;

export interface FunctionToolDescriptor<
  Id extends string,
  Target extends FunctionRefAny = FunctionRefAny,
> extends DescriptorBase<"tool", Id> {
  readonly ref: { readonly kind: "tool"; readonly id: Id };
  readonly target: FunctionToolTarget<Target>;
  readonly description: string;
  readonly sideEffect: FunctionToolSideEffect;
  readonly approval: FunctionToolApproval;
  readonly timeoutMs?: number;
  /** Invokes the target through the common tool and function runtime. */
  readonly invoke: (
    input: InferInput<Target["input"]>,
    options?: FunctionToolInvokeOptions,
  ) => Promise<InferOutput<Target["output"]>>;
}

type FunctionToolCreateOptions<
  Id extends string,
  Target extends FunctionRefAny,
> = FunctionToolMetadata & {
  readonly id?: Id;
  readonly target: Target;
};

export function createFunctionTool<const Id extends string, const Target extends FunctionRefAny>(
  options: FunctionToolCreateOptions<Id, Target>,
): FunctionToolDescriptor<Id, Target> {
  if (!isRecord(options)) throw new TypeError("Tool options must be an object");
  if (hasOwn(options, "handler")) throw new TypeError("Tools cannot own handlers");
  const target = copyFunctionTarget(options.target);
  const metadata = copyFunctionToolMetadata(options);
  const id = options.id === undefined ? createUnboundIdentity() : options.id;
  const base = createDescriptorBase("tool", id, metadata);
  const descriptor = {
    ...base,
    target,
    description: metadata.description,
    sideEffect: metadata.sideEffect,
    approval: metadata.approval,
    ...(metadata.timeoutMs === undefined ? {} : { timeoutMs: metadata.timeoutMs }),
  };
  Object.defineProperty(descriptor, "invoke", {
    value: createFunctionToolInvoker(
      options.target,
      {
        id,
        sideEffect: metadata.sideEffect,
        approval: metadata.approval,
        ...(metadata.timeoutMs === undefined ? {} : { timeoutMs: metadata.timeoutMs }),
      },
      descriptor,
    ),
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return deepFreeze(descriptor) as FunctionToolDescriptor<Id, Target>;
}

export function copyFunctionToolMetadata(value: unknown): FunctionToolMetadata {
  if (!isRecord(value)) throw new TypeError("Function tool metadata must be an object");
  const description = requiredText(value.description, "Tool description");
  const sideEffect = validateSideEffect(value.sideEffect);
  const approval = validateApproval(value.approval);
  if (value.timeoutMs !== undefined) positiveInteger(value.timeoutMs, "timeoutMs");
  const title = value.title;
  if (title !== undefined && typeof title !== "string") {
    throw new TypeError("Tool title must be a string");
  }
  const tags = copyTags(value.tags);
  return {
    ...(title === undefined ? {} : { title }),
    description,
    ...(tags === undefined ? {} : { tags }),
    sideEffect,
    approval,
    ...(value.timeoutMs === undefined ? {} : { timeoutMs: value.timeoutMs }),
  };
}

function copyFunctionTarget<Target extends FunctionRefAny>(
  target: Target,
): FunctionToolTarget<Target> {
  if (!isFunctionTarget(target)) throw new TypeError("Tool target must be a function reference");
  const identity = resolveDescriptorIdentity(target);
  return deepFreeze({
    ref: Object.freeze({
      kind: "function" as const,
      id: identity.canonical ? identity.id : target.ref.id,
    }),
    input: target.input,
    output: target.output,
    ...(target.errors === undefined ? {} : { errors: Object.freeze([...target.errors]) }),
  }) as FunctionToolTarget<Target>;
}

function isFunctionTarget(value: unknown): value is FunctionRefAny {
  return (
    isRecord(value) &&
    isRef(value.ref, "function") &&
    isSchema(value.input) &&
    isSchema(value.output) &&
    (!hasOwn(value, "handler") || typeof value.handler === "function") &&
    (!hasOwn(value, "invoke") || typeof value.invoke === "function") &&
    (value.errors === undefined ||
      (Array.isArray(value.errors) && value.errors.every(isErrorDescriptor)))
  );
}

function isErrorDescriptor(value: unknown): value is ErrorDescriptorAny {
  if (!isRecord(value) || value.kind !== "error" || !isStableId(value.id)) return false;
  const ref = value.ref;
  return (
    isRecord(ref) &&
    ref.kind === "error" &&
    ref.id === value.id &&
    typeof value.create === "function"
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

function validateSideEffect(value: unknown): FunctionToolSideEffect {
  if (value !== "none" && value !== "read" && value !== "write" && value !== "external") {
    throw new TypeError("Tool sideEffect must be none, read, write, or external");
  }
  return value;
}

function validateApproval(value: unknown): FunctionToolApproval {
  if (value !== "never" && value !== "on-write" && value !== "always") {
    throw new TypeError("Tool approval must be never, on-write, or always");
  }
  return value;
}

function requiredText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is required`);
  return value.trim();
}

function positiveInteger(value: unknown, name: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
}

function copyTags(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((tag) => typeof tag === "string")) {
    throw new TypeError("Tool tags must be an array of strings");
  }
  return Object.freeze([...value]);
}

function isRecord(value: unknown): value is Record<PropertyKey, any> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    !Array.isArray(value)
  );
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
