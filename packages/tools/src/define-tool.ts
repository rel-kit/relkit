import { createDescriptorBase, deepFreeze, isDescriptor, isRef } from "@relkit/contracts";
import { createUnboundIdentity } from "@relkit/invocation";
import {
  createFunctionToolInvoker,
  copyFunctionToolHooks,
  FunctionToolApprovalDeniedError,
  FunctionToolApprovalRequiredError,
  FunctionToolArgumentValidationError,
  FunctionToolOperationCancelledError,
  type FunctionToolApproval,
  type FunctionToolApprovalDecision,
  type FunctionToolApprovalRequest,
  type FunctionToolApprovalResolver,
  type FunctionToolDescriptor,
  type FunctionToolInvokeOptions,
  type FunctionToolMetadata,
  type FunctionToolSideEffect,
  type FunctionToolTarget,
  type FunctionRefAny,
} from "@relkit/functions";
import {
  copyFunctionTarget,
  hasOwn,
  isFunctionTarget,
  isNonEmptyString,
  isPositiveInteger,
  isRecord,
  isToolApproval,
  isToolSideEffect,
  positiveInteger,
  requiredText,
  validateApproval,
  validateSideEffect,
} from "./define-tool-validation.js";

export type ToolSideEffect = FunctionToolSideEffect;
export type ToolApproval = FunctionToolApproval;
export type ToolApprovalDecision = FunctionToolApprovalDecision;
export type ToolApprovalRequest = FunctionToolApprovalRequest;
export type ToolApprovalResolver = FunctionToolApprovalResolver;
export type ToolInvokeOptions = FunctionToolInvokeOptions;
export {
  FunctionToolApprovalDeniedError as ToolApprovalDeniedError,
  FunctionToolApprovalRequiredError as ToolApprovalRequiredError,
  FunctionToolArgumentValidationError as ToolArgumentValidationError,
  FunctionToolOperationCancelledError as ToolOperationCancelledError,
};

export interface ToolRef<Id extends string = string> {
  readonly ref: {
    readonly kind: "tool";
    readonly id: Id;
  };
}

export type ToolRefAny = ToolRef;

export type ToolTarget<Target extends FunctionRefAny> = FunctionToolTarget<Target>;

export type ToolDescriptor<
  Id extends string,
  Target extends FunctionRefAny = FunctionRefAny,
> = FunctionToolDescriptor<Id, Target>;

export interface DefineToolOptions<
  Id extends string,
  Target extends FunctionRefAny,
> extends FunctionToolMetadata {
  readonly id?: Id;
  readonly target: Target;
  readonly onBefore?: import("@relkit/functions").FunctionToolHook<
    import("@relkit/schema").InferInput<Target["input"]>
  >;
  readonly onAfter?: import("@relkit/functions").FunctionToolHook<
    import("@relkit/schema").InferOutput<Target["output"]>
  >;
}

/**
 * Defines a handler-free tool view over one function with side-effect and approval
 * metadata for safe invocation. Tool IDs may be inferred; `invoke` validates the
 * inherited input and fails closed when required approval is unavailable.
 *
 * @example
 * ```ts
 * import { defineFunction } from "@relkit/functions"
 * import { z } from "@relkit/schema"
 * import { defineTool } from "@relkit/tools"
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
  const hooks = copyFunctionToolHooks(options);
  if (options.timeoutMs !== undefined) positiveInteger(options.timeoutMs, "timeoutMs");
  const id = options.id === undefined ? createUnboundIdentity() : options.id;
  const base = createDescriptorBase("tool", id, options);

  const descriptor = {
    ...base,
    target,
    description,
    sideEffect,
    approval,
    mcp: options.mcp ?? true,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...hooks,
  };
  Object.defineProperty(descriptor, "invoke", {
    value: createFunctionToolInvoker(
      options.target,
      {
        id,
        sideEffect,
        approval,
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
        ...hooks,
      },
      descriptor,
    ),
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return deepFreeze(descriptor) as ToolDescriptor<Id, Target>;
}

export function isToolDescriptor(value: unknown): value is ToolDescriptor<string> {
  if (!isRecord(value) || hasOwn(value, "handler") || !isDescriptor(value, "tool")) {
    return false;
  }
  const descriptor = value as ToolDescriptor<string>;
  return (
    isFunctionTarget(descriptor.target) &&
    typeof descriptor.invoke === "function" &&
    isNonEmptyString(descriptor.description) &&
    isToolSideEffect(descriptor.sideEffect) &&
    isToolApproval(descriptor.approval) &&
    typeof descriptor.mcp === "boolean" &&
    (descriptor.timeoutMs === undefined || isPositiveInteger(descriptor.timeoutMs))
  );
}

export function assertToolDescriptor(value: unknown): asserts value is ToolDescriptor<string> {
  if (!isToolDescriptor(value)) throw new TypeError("Invalid tool descriptor");
}

export function isToolRef(value: unknown): value is ToolRefAny {
  return isRecord(value) && isRef(value.ref, "tool");
}
