import { normalizeId } from "@relkit/contracts";
import {
  dispatchInvocationEffect,
  getDescriptorIdentity,
  type InvocationTarget,
} from "@relkit/invocation";
import {
  SchemaIssuesError,
  SchemaValidatorLive,
  validateEffect,
  type InferInput,
  type InferOutput,
} from "@relkit/schema";
import { Effect } from "effect";
import type { FunctionRefAny } from "./types.js";
import type { FunctionToolApprovalRequest, FunctionToolInvokeOptions } from "./function-tool.js";
import type { FunctionToolRuntimeMetadata } from "./function-tool-runtime.types.js";
import {
  FunctionToolApprovalDeniedError,
  FunctionToolApprovalRequiredError,
  FunctionToolArgumentValidationError,
  FunctionToolOperationCancelledError,
} from "./function-tool-errors.js";
import {
  FunctionToolArgumentFailure,
  FunctionToolCancelledFailure,
} from "./function-tool-failures.js";
import { resolveFunctionToolApprovalEffect } from "./function-tool-approval.js";
import {
  FunctionOperationError,
  functionTry,
  observeFunction,
  runFunctionPromise,
  runFunctionSync,
} from "./function-observability.js";

export {
  FunctionToolApprovalDeniedError,
  FunctionToolApprovalRequiredError,
  FunctionToolArgumentValidationError,
  FunctionToolOperationCancelledError,
} from "./function-tool-errors.js";
export {
  FunctionToolApprovalDeniedFailure,
  FunctionToolApprovalRequiredFailure,
  FunctionToolArgumentFailure,
  FunctionToolCancelledFailure,
} from "./function-tool-failures.js";

/** Invokes a tool through schema validation, approval, and the Effect dispatcher.
 * @param target - Callable function target.
 * @param metadata - Tool policy and hooks.
 * @param input - Tool argument input.
 * @param options - Abort signal and approval resolver.
 * @param identity - Optional bound descriptor identity.
 * @returns Validated function output or a tagged tool failure.
 * @example Effect.runPromise(Effect.provide(invokeFunctionToolEffect(fn, metadata, input), SchemaValidatorLive));
 */
export const invokeFunctionToolEffect = Effect.fn("functions.tool.invoke")(
  <Target extends FunctionRefAny>(
    target: Target,
    metadata: FunctionToolRuntimeMetadata,
    input: InferInput<Target["input"]>,
    options: FunctionToolInvokeOptions = {},
    identity?: object,
  ) =>
    observeFunction(
      "tool.invoke",
      Effect.gen(function* () {
        const toolId = yield* functionTry("tool.invoker-create", () =>
          identity === undefined ? normalizeId(metadata.id) : getDescriptorIdentity(identity),
        );
        const validatedInput = yield* validateEffect(target.input, input).pipe(
          Effect.mapError((cause) => {
            const issues =
              cause instanceof SchemaIssuesError
                ? cause.issues
                : [{ message: "Tool arguments failed validation" }];
            return new FunctionToolArgumentFailure({
              issues,
              cause: new FunctionToolArgumentValidationError(issues),
            });
          }),
        );
        if (options.signal?.aborted)
          return yield* Effect.fail(
            new FunctionToolCancelledFailure({
              cause: new FunctionToolOperationCancelledError(),
            }),
          );
        const approval = Object.freeze({
          toolId,
          sideEffect: metadata.sideEffect,
          policy: metadata.approval,
        }) satisfies FunctionToolApprovalRequest;
        yield* resolveFunctionToolApprovalEffect(approval, options);
        return (yield* dispatchInvocationEffect({
          target: target as unknown as InvocationTarget,
          input: validatedInput,
          options: {
            source: "tool",
            ...(metadata.timeoutMs === undefined ? {} : { timeoutMs: metadata.timeoutMs }),
            ...(options.signal === undefined ? {} : { signal: options.signal }),
            ...(metadata.onBefore === undefined && metadata.onAfter === undefined
              ? {}
              : {
                  toolHooks: {
                    ...(metadata.onBefore === undefined ? {} : { onBefore: metadata.onBefore }),
                    ...(metadata.onAfter === undefined ? {} : { onAfter: metadata.onAfter }),
                  },
                }),
          },
        }).pipe(
          Effect.mapError(
            (cause) => new FunctionOperationError({ operation: "tool.invoke", cause: cause.cause }),
          ),
        )) as InferOutput<Target["output"]>;
      }),
    ),
);

/** Creates an Effect invoker that resolves services when each call runs.
 * @param target - Callable function target.
 * @param metadata - Tool policy and hooks.
 * @param identity - Optional bound descriptor identity.
 * @returns Effect invoker or tagged construction failure.
 * @example Effect.runSync(createFunctionToolInvokerEffect(fn, metadata));
 */
export const createFunctionToolInvokerEffect = Effect.fn("functions.tool.invoker-create")(
  <Target extends FunctionRefAny>(
    target: Target,
    metadata: FunctionToolRuntimeMetadata,
    identity?: object,
  ) =>
    functionTry(
      "tool.invoker-create",
      () =>
        (input: InferInput<Target["input"]>, options: FunctionToolInvokeOptions = {}) =>
          invokeFunctionToolEffect(target, metadata, input, options, identity),
    ),
);

/** Creates a Promise compatibility invoker for a tool.
 * @param target - Callable function target.
 * @param metadata - Tool policy and hooks.
 * @param identity - Optional bound descriptor identity.
 * @returns Promise invoker preserving established error classes.
 * @throws TypeError if construction metadata is invalid.
 * @example const invoke = createFunctionToolInvoker(fn, metadata);
 */
export function createFunctionToolInvoker<Target extends FunctionRefAny>(
  target: Target,
  metadata: FunctionToolRuntimeMetadata,
  identity?: object,
): (
  input: InferInput<Target["input"]>,
  options?: FunctionToolInvokeOptions,
) => Promise<InferOutput<Target["output"]>> {
  const invokeEffect = runFunctionSync(createFunctionToolInvokerEffect(target, metadata, identity));
  return (input, options) =>
    runFunctionPromise(Effect.provide(invokeEffect(input, options), SchemaValidatorLive));
}
