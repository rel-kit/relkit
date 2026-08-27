import {
  createDescriptorBase,
  deepFreeze,
  type MaybePromise,
  type DescriptorBase,
  type DescriptorMetadata,
} from "@relkit/contracts";
import { createUnboundIdentity, resolveDescriptorIdentity } from "@relkit/invocation";
import { type InferInput, type InferOutput } from "@relkit/schema";
import type { ErrorDescriptorAny } from "./define-error.js";
import type { FunctionRef, FunctionRefAny } from "./types.js";
import type { FunctionContext } from "./function-descriptor-types.js";
import { createFunctionToolInvoker } from "./function-tool-runtime.js";
import {
  hasOwn,
  copyFunctionToolHooks,
  isErrorDescriptor,
  isFunctionTarget,
  isRecord,
  positiveInteger,
  requiredText,
  validateApproval,
  validateSideEffect,
} from "./function-tool-validation.js";
export { copyFunctionToolHooks } from "./function-tool-validation.js";
export type FunctionToolSideEffect = "none" | "read" | "write" | "external";
export type FunctionToolApproval = "never" | "on-write" | "always";
export interface FunctionToolMetadata extends DescriptorMetadata {
  readonly description: string;
  readonly sideEffect: FunctionToolSideEffect;
  readonly approval: FunctionToolApproval;
  readonly timeoutMs?: number;
  readonly mcp?: boolean;
}
export type FunctionToolContext = Pick<
  FunctionContext,
  "invocation" | "signal" | "env" | "log" | "time"
>;
export type FunctionToolHook<Value = unknown> = (
  value: Value,
  context: FunctionToolContext,
) => MaybePromise<Value>;
export interface FunctionToolOptions<
  Id extends string = string,
  Input = unknown,
  Output = unknown,
> extends FunctionToolMetadata {
  readonly id?: Id;
  readonly onBefore?: FunctionToolHook<Input>;
  readonly onAfter?: FunctionToolHook<Output>;
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
  readonly mcp: boolean;
  readonly onBefore?: FunctionToolHook<InferInput<Target["input"]>>;
  readonly onAfter?: FunctionToolHook<InferOutput<Target["output"]>>;
  /** Invokes the target through the common tool and function runtime. */
  readonly invoke: (
    input: InferInput<Target["input"]>,
    options?: FunctionToolInvokeOptions,
  ) => Promise<InferOutput<Target["output"]>>;
}
type FunctionToolCreateOptions<
  Id extends string,
  Target extends FunctionRefAny,
> = FunctionToolOptions<Id, InferInput<Target["input"]>, InferOutput<Target["output"]>> & {
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
  const hooks = copyFunctionToolHooks(options);
  const id = options.id === undefined ? createUnboundIdentity() : options.id;
  const base = createDescriptorBase("tool", id, metadata);
  const descriptor = {
    ...base,
    target,
    description: metadata.description,
    sideEffect: metadata.sideEffect,
    approval: metadata.approval,
    mcp: metadata.mcp ?? true,
    ...(metadata.timeoutMs === undefined ? {} : { timeoutMs: metadata.timeoutMs }),
    ...hooks,
  };
  Object.defineProperty(descriptor, "invoke", {
    value: createFunctionToolInvoker(
      options.target,
      {
        id,
        sideEffect: metadata.sideEffect,
        approval: metadata.approval,
        ...(metadata.timeoutMs === undefined ? {} : { timeoutMs: metadata.timeoutMs }),
        ...hooks,
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
  if (value.mcp !== undefined && typeof value.mcp !== "boolean") {
    throw new TypeError("Tool mcp must be a boolean");
  }
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
    ...(value.mcp === undefined ? {} : { mcp: value.mcp }),
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
type TargetErrors<Target extends FunctionRefAny> =
  NonNullable<Target["errors"]> extends readonly ErrorDescriptorAny[]
    ? NonNullable<Target["errors"]>
    : readonly ErrorDescriptorAny[];
function copyTags(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((tag) => typeof tag === "string")) {
    throw new TypeError("Tool tags must be an array of strings");
  }
  return Object.freeze([...value]);
}
