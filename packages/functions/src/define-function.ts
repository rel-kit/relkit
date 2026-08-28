import { createDescriptorBase, deepFreeze } from "@relkit/contracts";
import {
  createUnboundIdentity,
  dispatchInvocation,
  getDescriptorIdentity,
  type InvocationTarget,
} from "@relkit/invocation";
import { type StandardSchemaV1 } from "@relkit/schema";
import { isErrorDescriptor, type ErrorDescriptorAny } from "./define-error.js";
import type { DefineFunction } from "./define-function-types.js";
import {
  copyFunctionToolMetadata,
  copyFunctionToolHooks,
  createFunctionTool,
  type FunctionToolOptions,
} from "./function-tool.js";
import {
  assertSchema,
  assertHook,
  copyDependencies,
  functionTargetForReceiver,
  validateLimit,
} from "./define-function-validation.js";
import type {
  DefineFunctionOptions,
  FunctionDependencies,
  FunctionDescriptor,
  FunctionRefAny,
} from "./types.js";
type FunctionImplementationOptions = Omit<
  DefineFunctionOptions<
    string,
    StandardSchemaV1,
    StandardSchemaV1,
    FunctionDependencies,
    readonly ErrorDescriptorAny[]
  >,
  "handler"
> & { readonly handler: (...args: any[]) => unknown };
export type {
  AgentClientFor,
  AgentClients,
  AgentRef,
  AgentRefAny,
  BucketClient,
  BucketClientFor,
  BucketClients,
  BucketObjectMetadata,
  BucketRef,
  BucketRefAny,
  CacheClient,
  CacheClientFor,
  CacheClients,
  CacheOperationOptions,
  CacheRef,
  CacheRefAny,
  DescriptorRef,
  DefineFunctionOptions,
  EventClientFor,
  EventClients,
  EventAttributeValue,
  EventPublishOptions,
  EventPublishResult,
  EventRef,
  EventRefAny,
  FunctionContext,
  FunctionDependencies,
  FunctionDescriptor,
  FunctionRef,
  FunctionRefAny,
  InvocationMetadata,
  InvocationSource,
  JobEnqueueOptions,
  JobClientFor,
  JobClients,
  JobEnqueueResult,
  JobRef,
  JobRefAny,
  JobState,
  JobStatus,
  PublicClock,
  PublicLogger,
  ResolvedApplicationEnv,
} from "./types.js";
/**
 * Defines the graph-visible executable unit shared by HTTP, background, tool, and agent calls.
 *
 * The `id` is optional for source-scoped functions; the compiler derives it from the
 * source/export hierarchy. Durable resources keep explicit IDs. The handler receives
 * validated reusable input and an invocation-scoped context. Use `descriptor.invoke(input)`
 * for nested calls so the
 * common engine preserves validation, service policy, limits, and telemetry.
 *
 * @example
 * ```ts
 * import { defineFunction } from "@relkit/app/functions"
 * import { z } from "@relkit/app/schema"
 *
 * const greet = defineFunction({
 *   input: z.object({ name: z.string() }),
 *   output: z.object({ message: z.string() }),
 *   handler: async ({ name }, context) => {
 *     context.log.info("greeting requested")
 *     return { message: `Hello, ${name}!` }
 *   }
 * })
 * const result = await greet.invoke({ name: "Ada" })
 * void result
 * void greet
 * ```
 * @category Functions
 * @since 0.1.0
 */
export const defineFunction: DefineFunction = (
  options: FunctionImplementationOptions,
): FunctionDescriptor<
  string,
  unknown,
  unknown,
  FunctionDependencies,
  readonly ErrorDescriptorAny[]
> => {
  assertSchema(options.input, "input");
  assertSchema(options.output, "output");
  if (typeof options.handler !== "function") {
    throw new TypeError("Function handler must be a function");
  }
  assertHook(options.onBefore, "onBefore");
  assertHook(options.onAfter, "onAfter");
  validateLimit(options.timeoutMs, "timeoutMs");
  validateLimit(options.concurrency, "concurrency");
  const id = options.id === undefined ? createUnboundIdentity() : options.id;
  const base = createDescriptorBase("function", id, options);
  const dependencies = copyDependencies(options.dependencies);
  const errors = copyErrors(options.errors);
  const tool = options.tool === undefined ? undefined : copyFunctionToolMetadata(options.tool);
  const descriptor = {
    ...base,
    input: options.input,
    output: options.output,
    ...(errors === undefined ? {} : { errors }),
    ...(dependencies === undefined ? {} : { dependencies }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
    ...(tool === undefined ? {} : { tool }),
    ...(options.onBefore === undefined ? {} : { onBefore: options.onBefore }),
    ...(options.onAfter === undefined ? {} : { onAfter: options.onAfter }),
    handler: options.handler,
  };
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
      const hooks = toolOptions === undefined ? {} : copyFunctionToolHooks(toolOptions);
      return createFunctionTool({
        ...metadata,
        ...hooks,
        id: toolOptions?.id ?? `${getDescriptorIdentity(target)}.tool`,
        target,
      });
    },
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return deepFreeze(descriptor) as unknown as FunctionDescriptor<
    string,
    unknown,
    unknown,
    FunctionDependencies,
    readonly ErrorDescriptorAny[]
  >;
};
function copyErrors<E extends readonly ErrorDescriptorAny[]>(errors: E | undefined): E | undefined {
  if (errors === undefined) return undefined;
  if (!errors.every(isErrorDescriptor))
    throw new TypeError("Function errors must be declared errors");
  return Object.freeze([...errors]) as E;
}
