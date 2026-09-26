import { FunctionInputError } from "./function-input-error.js";
import { createDescriptorBase, deepFreeze } from "@relkit/contracts";
import { Effect } from "effect";
import { isErrorDescriptor, type ErrorDescriptorAny } from "./define-error.js";
import { functionTry, runFunctionSync } from "./function-observability.js";
import { addCallableMethods } from "./function-descriptor-methods.js";
import {
  assertHook,
  assertSchema,
  copyDependencies,
  copyPublishes,
  validateLimit,
} from "./define-function-validation.js";
import { isStreamOutputSchema } from "./stream.js";
import { copyFunctionToolMetadata } from "./function-tool.js";
import type { FunctionDescriptorFactoryOptions } from "./function-descriptor-factory.types.js";

export type { FunctionDescriptorFactoryOptions } from "./function-descriptor-factory.types.js";

/** Creates a function descriptor through Effect.
 * @param options - Definition, handler, and metadata.
 * @returns The frozen descriptor or a tagged validation failure.
 * @example Effect.runSync(createFunctionDescriptorEffect(options));
 */
export const createFunctionDescriptorEffect = Effect.fn("functions.function.create-descriptor")(
  (
    options: FunctionDescriptorFactoryOptions,
  ): Effect.Effect<unknown, import("./function-observability.js").FunctionOperationError> =>
    functionTry("function.create-descriptor", () => {
      assertSchema(options.input, "input");
      assertSchema(options.output, "output");
      if (options.progress !== undefined) assertSchema(options.progress, "progress");
      if (typeof options.handler !== "function")
        throw new FunctionInputError("Function handler must be a function");
      assertHook(options.onBefore, "onBefore");
      assertHook(options.onAfter, "onAfter");
      validateLimit(options.timeoutMs, "timeoutMs");
      validateLimit(options.concurrency, "concurrency");
      if (options.invocationMode === "event-only" && options.tool !== undefined) {
        throw new FunctionInputError("Event functions cannot declare tool metadata");
      }
      if (isStreamOutputSchema(options.output) && options.tool !== undefined) {
        throw new FunctionInputError("Stream-output functions cannot declare tool metadata");
      }
      const base = createDescriptorBase("function", options.id, options);
      const dependencies = copyDependencies(options.dependencies);
      const publishes = copyPublishes(options.publishes);
      const errors = copyErrors(options.errors);
      const tool = options.tool === undefined ? undefined : copyFunctionToolMetadata(options.tool);
      const descriptor = {
        ...base,
        invocationMode: options.invocationMode,
        input: options.input,
        output: options.output,
        ...(options.progress === undefined ? {} : { progress: options.progress }),
        ...(options.descriptorFields ?? {}),
        ...(errors === undefined ? {} : { errors }),
        ...(dependencies === undefined ? {} : { dependencies }),
        ...(publishes === undefined ? {} : { publishes }),
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
        ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
        ...(tool === undefined ? {} : { tool }),
        ...(options.onBefore === undefined ? {} : { onBefore: options.onBefore }),
        ...(options.onAfter === undefined ? {} : { onAfter: options.onAfter }),
        handler: options.handler,
      };
      if (options.invocationMode === "callable") addCallableMethods(descriptor, tool);
      return deepFreeze(descriptor);
    }),
);

/** Creates a frozen function descriptor for an authoring package.
 * @param options - Definition, handler, and metadata.
 * @returns The frozen descriptor.
 * @throws TypeError for malformed schemas, hooks, limits, or dependencies.
 * @example createFunctionDescriptor(options);
 */
export function createFunctionDescriptor(options: FunctionDescriptorFactoryOptions): unknown {
  return runFunctionSync(createFunctionDescriptorEffect(options));
}

function copyErrors(
  errors: readonly ErrorDescriptorAny[] | undefined,
): readonly ErrorDescriptorAny[] | undefined {
  if (errors === undefined) return undefined;
  if (!errors.every(isErrorDescriptor))
    throw new FunctionInputError("Function errors must be declared errors");
  return Object.freeze([...errors]);
}
