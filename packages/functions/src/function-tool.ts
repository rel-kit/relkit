import { FunctionInputError } from "./function-input-error.js";
import { createDescriptorBase, deepFreeze } from "@relkit/contracts";
import { createUnboundIdentity, resolveDescriptorIdentity } from "@relkit/invocation";
import { Effect } from "effect";
import { SchemaValidatorLive } from "@relkit/schema";
import type { FunctionRefAny } from "./types.js";
import {
  functionAttempt,
  functionTry,
  observeFunction,
  runFunctionPromise,
  runFunctionSync,
} from "./function-observability.js";
import type {
  FunctionToolCreateOptions,
  FunctionToolDescriptor,
  FunctionToolMetadata,
  FunctionToolTarget,
} from "./function-tool.types.js";
export type * from "./function-tool.types.js";
import { createFunctionToolInvokerEffect } from "./function-tool-runtime.js";
import {
  hasOwn,
  copyFunctionToolHooks,
  isFunctionTarget,
  isRecord,
  positiveInteger,
  requiredText,
  validateApproval,
  validateSideEffect,
} from "./function-tool-validation.js";
export { copyFunctionToolHooks, copyFunctionToolHooksEffect } from "./function-tool-validation.js";
/** Creates a tool descriptor through Effect.
 * @param options - Target function and tool metadata.
 * @returns Frozen tool descriptor or tagged validation failure.
 * @example Effect.runSync(createFunctionToolEffect({ target: fn, description: "Get order", sideEffect: "read", approval: "never" }));
 */
export const createFunctionToolEffect = Effect.fn("functions.tool.create")(
  <const Id extends string, const Target extends FunctionRefAny>(
    options: FunctionToolCreateOptions<Id, Target>,
  ): Effect.Effect<
    FunctionToolDescriptor<Id, Target>,
    import("./function-observability.js").FunctionOperationError
  > =>
    observeFunction(
      "tool.create",
      Effect.gen(function* () {
        const { descriptor, metadata, hooks, id } = yield* functionAttempt("tool.create", () => {
          if (!isRecord(options)) throw new FunctionInputError("Tool options must be an object");
          if (hasOwn(options, "handler")) throw new FunctionInputError("Tools cannot own handlers");
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
          return { descriptor, metadata, hooks, id };
        });
        const invokeEffect = yield* createFunctionToolInvokerEffect(
          options.target,
          {
            id,
            sideEffect: metadata.sideEffect,
            approval: metadata.approval,
            ...(metadata.timeoutMs === undefined ? {} : { timeoutMs: metadata.timeoutMs }),
            ...hooks,
          },
          descriptor,
        );
        return yield* functionAttempt("tool.create", () => {
          Object.defineProperty(descriptor, "invokeEffect", {
            value: invokeEffect,
            enumerable: false,
            writable: false,
            configurable: false,
          });
          Object.defineProperty(descriptor, "invoke", {
            value: (
              input: unknown,
              options?: import("./function-tool.types.js").FunctionToolInvokeOptions,
            ) =>
              runFunctionPromise(
                Effect.provide(invokeEffect(input as never, options), SchemaValidatorLive),
              ),
            enumerable: false,
            writable: false,
            configurable: false,
          });
          return deepFreeze(descriptor) as FunctionToolDescriptor<Id, Target>;
        });
      }),
    ),
);

/** Creates a frozen tool descriptor.
 * @param options - Target function and tool metadata.
 * @returns Frozen tool descriptor.
 * @throws TypeError for malformed target or metadata.
 * @example const tool = createFunctionTool({ target: fn, description: "Get order", sideEffect: "read", approval: "never" });
 */
export function createFunctionTool<const Id extends string, const Target extends FunctionRefAny>(
  options: FunctionToolCreateOptions<Id, Target>,
): FunctionToolDescriptor<Id, Target> {
  return runFunctionSync(createFunctionToolEffect(options));
}

/** Copies and validates tool metadata through Effect.
 * @param value - Untrusted metadata.
 * @returns Normalized metadata or tagged validation failure.
 * @example Effect.runSync(copyFunctionToolMetadataEffect(raw));
 */
export const copyFunctionToolMetadataEffect = Effect.fn("functions.tool.copy-metadata")(
  (
    value: unknown,
  ): Effect.Effect<
    FunctionToolMetadata,
    import("./function-observability.js").FunctionOperationError
  > =>
    functionTry("tool.copy-metadata", () => {
      if (!isRecord(value))
        throw new FunctionInputError("Function tool metadata must be an object");
      const description = requiredText(value.description, "Tool description");
      const sideEffect = validateSideEffect(value.sideEffect);
      const approval = validateApproval(value.approval);
      if (value.timeoutMs !== undefined) positiveInteger(value.timeoutMs, "timeoutMs");
      if (value.mcp !== undefined && typeof value.mcp !== "boolean") {
        throw new FunctionInputError("Tool mcp must be a boolean");
      }
      const title = value.title;
      if (title !== undefined && typeof title !== "string") {
        throw new FunctionInputError("Tool title must be a string");
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
    }),
);

/** Copies and validates tool metadata.
 * @param value - Untrusted metadata.
 * @returns Normalized metadata.
 * @throws TypeError for invalid fields.
 * @example copyFunctionToolMetadata({ description: "Get order", sideEffect: "read", approval: "never" });
 */
export function copyFunctionToolMetadata(value: unknown): FunctionToolMetadata {
  return runFunctionSync(copyFunctionToolMetadataEffect(value));
}
function copyFunctionTarget<Target extends FunctionRefAny>(
  target: Target,
): FunctionToolTarget<Target> {
  if (!isFunctionTarget(target))
    throw new FunctionInputError("Tool target must be a function reference");
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
function copyTags(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((tag) => typeof tag === "string")) {
    throw new FunctionInputError("Tool tags must be an array of strings");
  }
  return Object.freeze([...value]);
}
