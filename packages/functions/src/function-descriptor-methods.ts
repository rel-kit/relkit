import { FunctionInputError } from "./function-input-error.js";
import {
  dispatchInvocationEffect,
  getDescriptorIdentity,
  type InvocationTarget,
} from "@relkit/invocation";
import { Effect } from "effect";
import type { FunctionRefAny } from "./types.js";
import {
  functionTargetForReceiver,
  functionTargetForReceiverEffect,
} from "./define-function-validation.js";
import {
  FunctionOperationError,
  functionAttempt,
  observeFunction,
  runFunctionPromise,
  runFunctionSync,
} from "./function-observability.js";
import { isStreamOutputSchemaEffect } from "./stream.js";
import {
  createFunctionToolEffect,
  copyFunctionToolMetadataEffect,
  type FunctionToolMetadata,
  type FunctionToolOptions,
} from "./function-tool.js";
import { copyFunctionToolHooksEffect } from "./function-tool-validation.js";
import { createFunctionGraphNodeEffect } from "./function-graph-node.js";

/** Invokes a callable descriptor through the Effect dispatcher.
 * @param receiver - Method receiver, possibly a bound descriptor.
 * @param descriptor - Original callable descriptor.
 * @param input - Invocation input.
 * @returns Effect yielding the function output or a tagged dispatch failure.
 * @example Effect.runPromise(invokeDescriptorEffect(fn, fn, { id: "one" }));
 */
export const invokeDescriptorEffect = Effect.fn("functions.function.invoke")(
  (receiver: unknown, descriptor: FunctionRefAny, input: unknown) =>
    observeFunction(
      "function.invoke",
      Effect.gen(function* () {
        const target = yield* functionAttempt("function.invoke-target", () =>
          functionTargetForReceiver(receiver, descriptor),
        );
        return yield* dispatchInvocationEffect({
          target: target as unknown as InvocationTarget,
          input,
        }).pipe(
          Effect.mapError(
            (failure) =>
              new FunctionOperationError({ operation: "function.invoke", cause: failure.cause }),
          ),
        );
      }),
    ),
);

/** Derives a tool view through Effect.
 * @param receiver - Method receiver, possibly a bound descriptor.
 * @param descriptor - Original callable descriptor.
 * @param tool - Declared tool metadata, if any.
 * @param options - Optional per-view override.
 * @returns Effect yielding a tool descriptor or a tagged validation failure.
 * @example Effect.runSync(asToolEffect(fn, fn, fn.tool));
 */
export const asToolEffect = Effect.fn("functions.function.as-tool")(
  (
    receiver: unknown,
    descriptor: FunctionRefAny & { readonly id: string },
    tool: FunctionToolMetadata | undefined,
    options?: FunctionToolOptions<string>,
  ) =>
    observeFunction(
      "function.as-tool",
      Effect.gen(function* () {
        if (yield* isStreamOutputSchemaEffect(descriptor.output))
          return yield* functionAttempt("function.as-tool", () => {
            throw new FunctionInputError("Stream-output functions cannot be converted to tools");
          });
        const metadata =
          options === undefined ? tool : yield* copyFunctionToolMetadataEffect(options);
        if (metadata === undefined)
          return yield* functionAttempt("function.as-tool", () => {
            throw new FunctionInputError(
              `Function "${descriptor.id}" must declare complete tool metadata before calling asTool()`,
            );
          });
        const target = yield* functionTargetForReceiverEffect(receiver, descriptor);
        const hooks = options === undefined ? {} : yield* copyFunctionToolHooksEffect(options);
        const id = yield* functionAttempt(
          "function.as-tool",
          () => options?.id ?? `${getDescriptorIdentity(target)}.tool`,
        );
        return yield* createFunctionToolEffect({ ...metadata, ...hooks, id, target });
      }),
    ),
);

/** Derives a graph node view through Effect.
 * @param receiver - Method receiver, possibly a bound descriptor.
 * @param descriptor - Original callable descriptor.
 * @param options - Optional graph node identity.
 * @returns Effect yielding a graph node or a tagged validation failure.
 * @example Effect.runSync(asGraphNodeEffect(fn, fn));
 */
export const asGraphNodeEffect = Effect.fn("functions.function.as-graph-node")(
  (receiver: unknown, descriptor: FunctionRefAny, options?: { readonly id?: string }) =>
    observeFunction(
      "function.as-graph-node",
      Effect.gen(function* () {
        if (yield* isStreamOutputSchemaEffect(descriptor.output))
          return yield* functionAttempt("function.as-graph-node", () => {
            throw new FunctionInputError(
              "Stream-output functions cannot be converted to graph nodes",
            );
          });
        return yield* createFunctionGraphNodeEffect(receiver, descriptor, options);
      }),
    ),
);

/** Installs compatibility methods while the descriptor creation Effect owns mutation.
 * @param descriptor - Mutable descriptor under construction.
 * @param tool - Optional declared tool metadata.
 * @returns Nothing; the methods run their Effect counterparts when called.
 * @example addCallableMethods(descriptor, metadata);
 */
export function addCallableMethods(
  descriptor: Record<string, any>,
  tool: FunctionToolMetadata | undefined,
): void {
  Object.defineProperties(descriptor, {
    invoke: {
      value: function (this: unknown, input: unknown) {
        return runFunctionPromise(
          invokeDescriptorEffect(this, descriptor as FunctionRefAny, input),
        );
      },
      enumerable: false,
      writable: false,
      configurable: false,
    },
    asTool: {
      value: function (this: unknown, options?: FunctionToolOptions<string>) {
        return runFunctionSync(
          asToolEffect(this, descriptor as FunctionRefAny & { readonly id: string }, tool, options),
        );
      },
      enumerable: false,
      writable: false,
      configurable: false,
    },
    asGraphNode: {
      value: function (this: unknown, options?: { readonly id?: string }) {
        return runFunctionSync(asGraphNodeEffect(this, descriptor as FunctionRefAny, options));
      },
      enumerable: false,
      writable: false,
      configurable: false,
    },
  });
}
