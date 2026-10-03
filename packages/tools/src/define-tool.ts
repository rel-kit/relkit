import { createDescriptorBase, deepFreeze } from "@relkit/contracts";
import { createUnboundIdentityEffect } from "@relkit/invocation";
import {
  createFunctionToolInvoker,
  copyFunctionToolHooks,
  FunctionToolApprovalDeniedError,
  FunctionToolApprovalRequiredError,
  FunctionToolArgumentValidationError,
  FunctionToolOperationCancelledError,
} from "@relkit/functions";
import { Effect } from "effect";
import {
  copyFunctionTargetEffect,
  positiveIntegerEffect,
  requiredTextEffect,
  validateApprovalEffect,
  validateSideEffectEffect,
} from "./define-tool-validation.js";
import { isRecordEffect } from "./tool-predicates.js";
import {
  observeTool,
  runToolSync,
  ToolOperationFailure,
  toolAttempt,
} from "./tool-observability.js";
import type { DefineToolOptions, ToolDescriptor } from "./define-tool.types.js";
import type { FunctionRefAny } from "@relkit/functions";

export type * from "./define-tool.types.js";
export {
  assertToolDescriptor,
  assertToolDescriptorEffect,
  isToolDescriptor,
  isToolDescriptorEffect,
  isToolRef,
  isToolRefEffect,
} from "./define-tool-predicates.js";
export {
  FunctionToolApprovalDeniedError as ToolApprovalDeniedError,
  FunctionToolApprovalRequiredError as ToolApprovalRequiredError,
  FunctionToolArgumentValidationError as ToolArgumentValidationError,
  FunctionToolOperationCancelledError as ToolOperationCancelledError,
};

/** Defines a frozen, handler-free tool view through Effect.
 * @param options - Function target and tool policy.
 * @returns Descriptor or tagged authoring failure.
 * @example Effect.runSync(defineToolEffect({ id: "orders.lookup", target, description: "Read order", sideEffect: "read", approval: "never" }));
 */
export const defineToolEffect = Effect.fn("tools.define")(
  <const Id extends string, const Target extends FunctionRefAny>(
    options: DefineToolOptions<Id, Target>,
  ) =>
    observeTool(
      "define",
      Effect.gen(function* () {
        const validOptions = yield* isRecordEffect(options);
        yield* toolAttempt("define", () => {
          if (!validOptions) throw new TypeError("Tool options must be an object");
          if (Object.prototype.hasOwnProperty.call(options, "handler"))
            throw new TypeError("Tools cannot own handlers");
        });
        const target = yield* copyFunctionTargetEffect(options.target);
        const description = yield* requiredTextEffect(options.description, "Tool description");
        const sideEffect = yield* validateSideEffectEffect(options.sideEffect);
        const approval = yield* validateApprovalEffect(options.approval);
        const hooks = yield* toolAttempt("define", () => copyFunctionToolHooks(options));
        if (options.timeoutMs !== undefined)
          yield* positiveIntegerEffect(options.timeoutMs, "timeoutMs");
        const id =
          options.id === undefined
            ? yield* createUnboundIdentityEffect().pipe(
                Effect.mapError(
                  (failure) =>
                    new ToolOperationFailure({
                      operation: "define",
                      reason: failure.message,
                      cause: failure.cause,
                    }),
                ),
              )
            : options.id;
        const base = yield* toolAttempt("define", () => createDescriptorBase("tool", id, options));
        return yield* toolAttempt("define", () => {
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
        });
      }),
    ),
);

/** Defines a frozen, handler-free tool view over one function.
 * @param options - Function target and policy metadata.
 * @returns Frozen tool descriptor.
 * @throws TypeError for malformed target, metadata, or ID.
 * @example
 * ```ts
 * import { defineFunction } from "@relkit/functions";
 * import { z } from "@relkit/schema";
 * import { defineTool } from "@relkit/tools";
 * const lookup = defineFunction({
 *   id: "orders.lookup", input: z.string(), output: z.string(), handler: (id) => id,
 * });
 * const tool = defineTool({
 *   id: "orders.lookup-tool", target: lookup, description: "Read order",
 *   sideEffect: "read", approval: "never",
 * });
 * ```
 * @category Tools
 * @since 0.1.0
 */
export function defineTool<const Id extends string, const Target extends FunctionRefAny>(
  options: DefineToolOptions<Id, Target>,
): ToolDescriptor<Id, Target> {
  return runToolSync(defineToolEffect(options));
}
