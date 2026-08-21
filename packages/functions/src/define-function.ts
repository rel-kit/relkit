import { createDescriptorBase, deepFreeze, isRef, type DescriptorKind } from "@zsys/contracts";
import {
  createUnboundIdentity,
  dispatchInvocation,
  getDescriptorIdentity,
  type InvocationTarget,
} from "@zsys/invocation";
import { type StandardSchemaV1 } from "@zsys/schema";
import { isErrorDescriptor, type ErrorDescriptorAny } from "./define-error.js";
import type { DefineFunction } from "./define-function-types.js";
import {
  copyFunctionToolMetadata,
  createFunctionTool,
  type FunctionToolOptions,
} from "./function-tool.js";
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
  FunctionRequest,
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
 * validated reusable input, an immutable HTTP request when the call has HTTP transport,
 * and a request-scoped context. Use `descriptor.invoke(input)` for nested calls so the
 * common engine preserves validation, service policy, limits, and telemetry.
 *
 * @example
 * ```ts
 * import { defineFunction } from "@zsys/functions"
 * import { z } from "@zsys/schema"
 *
 * const greet = defineFunction({
 *   input: z.object({ name: z.string() }),
 *   output: z.object({ message: z.string() }),
 *   handler: async ({ name }, request, context) => {
 *     context.log.info("greeting requested", { url: request?.url })
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
      return createFunctionTool({
        ...metadata,
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

function copyDependencies<D extends FunctionDependencies>(
  dependencies: D | undefined,
): D | undefined {
  if (dependencies === undefined) return undefined;
  if (Object.hasOwn(dependencies, "functions")) {
    throw new TypeError("Function dependencies are not supported; use descriptor.invoke");
  }
  const result: Record<string, unknown> = {};
  const kinds: Readonly<Record<string, DescriptorKind>> = {
    jobs: "job",
    events: "event",
    buckets: "bucket",
    cache: "cache",
    agents: "agent",
  };
  for (const [name, kind] of Object.entries(kinds)) {
    const map = dependencies[name as keyof FunctionDependencies];
    if (map === undefined) continue;
    if (!isRecord(map)) throw new TypeError(`Function dependency map "${name}" must be an object`);
    const copied: Record<string, unknown> = {};
    for (const [client, target] of Object.entries(map)) {
      if (!isRecord(target) || !isRef(target.ref, kind)) {
        throw new TypeError(`Invalid ${name} dependency "${client}"`);
      }
      copied[client] = target;
    }
    result[name] = Object.freeze(copied);
  }
  return Object.freeze(result) as D;
}

function validateLimit(value: number | undefined, name: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
    throw new TypeError(`${name} must be a positive integer`);
  }
}

function assertSchema(value: unknown, name: string): asserts value is StandardSchemaV1 {
  if (!isRecord(value)) throw new TypeError(`${name} must be a Standard Schema v1 validator`);
  const standard = value["~standard"];
  if (!isRecord(standard) || standard.version !== 1 || typeof standard.validate !== "function") {
    throw new TypeError(`${name} must be a Standard Schema v1 validator`);
  }
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function functionTargetForReceiver(receiver: unknown, fallback: FunctionRefAny): FunctionRefAny {
  if (
    isRecord(receiver) &&
    isRef(receiver.ref, "function") &&
    typeof receiver.handler === "function"
  ) {
    return receiver as unknown as FunctionRefAny;
  }
  return fallback;
}
