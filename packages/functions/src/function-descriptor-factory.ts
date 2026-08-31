import { createDescriptorBase, deepFreeze, type DescriptorMetadata } from "@relkit/contracts";
import {
  dispatchInvocation,
  getDescriptorIdentity,
  type InvocationTarget,
} from "@relkit/invocation";
import type { StandardSchemaV1 } from "@relkit/schema";
import { isErrorDescriptor, type ErrorDescriptorAny } from "./define-error.js";
import {
  assertHook,
  assertSchema,
  copyDependencies,
  copyPublishes,
  functionTargetForReceiver,
  validateLimit,
} from "./define-function-validation.js";
import type { FunctionRefAny } from "./types.js";
import {
  copyFunctionToolHooks,
  copyFunctionToolMetadata,
  createFunctionTool,
  type FunctionToolOptions,
} from "./function-tool.js";

export interface FunctionDescriptorFactoryOptions extends DescriptorMetadata {
  readonly id: string;
  readonly input: StandardSchemaV1;
  readonly output: StandardSchemaV1;
  readonly invocationMode: "callable" | "event-only";
  readonly handler: (...args: any[]) => unknown;
  readonly errors?: readonly ErrorDescriptorAny[];
  readonly dependencies?: import("./types.js").FunctionDependencies;
  readonly publishes?: readonly string[];
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly tool?: import("./function-tool.js").FunctionToolMetadata;
  readonly onBefore?: (...args: any[]) => unknown;
  readonly onAfter?: (...args: any[]) => unknown;
  readonly descriptorFields?: Readonly<Record<string, unknown>>;
}

export function createFunctionDescriptor(options: FunctionDescriptorFactoryOptions): unknown {
  assertSchema(options.input, "input");
  assertSchema(options.output, "output");
  if (typeof options.handler !== "function")
    throw new TypeError("Function handler must be a function");
  assertHook(options.onBefore, "onBefore");
  assertHook(options.onAfter, "onAfter");
  validateLimit(options.timeoutMs, "timeoutMs");
  validateLimit(options.concurrency, "concurrency");
  if (options.invocationMode === "event-only" && options.tool !== undefined) {
    throw new TypeError("Event functions cannot declare tool metadata");
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
}

function addCallableMethods(
  descriptor: Record<string, any>,
  tool: import("./function-tool.js").FunctionToolMetadata | undefined,
): void {
  Object.defineProperty(descriptor, "invoke", {
    value: function (this: unknown, input: unknown) {
      return dispatchInvocation({
        target: functionTargetForReceiver(
          this,
          descriptor as unknown as FunctionRefAny,
        ) as unknown as InvocationTarget,
        input,
      });
    },
    enumerable: false,
    writable: false,
    configurable: false,
  });
  Object.defineProperty(descriptor, "asTool", {
    value: function (this: unknown, toolOptions?: FunctionToolOptions<string>) {
      const metadata = toolOptions === undefined ? tool : copyFunctionToolMetadata(toolOptions);
      if (metadata === undefined) {
        throw new TypeError(
          `Function "${descriptor.id}" must declare complete tool metadata before calling asTool()`,
        );
      }
      const target = functionTargetForReceiver(this, descriptor as unknown as FunctionRefAny);
      return createFunctionTool({
        ...metadata,
        ...(toolOptions === undefined ? {} : copyFunctionToolHooks(toolOptions)),
        id: toolOptions?.id ?? `${getDescriptorIdentity(target)}.tool`,
        target,
      });
    },
    enumerable: false,
    writable: false,
    configurable: false,
  });
}

function copyErrors(
  errors: readonly ErrorDescriptorAny[] | undefined,
): readonly ErrorDescriptorAny[] | undefined {
  if (errors === undefined) return undefined;
  if (!errors.every(isErrorDescriptor))
    throw new TypeError("Function errors must be declared errors");
  return Object.freeze([...errors]);
}
