import { createUnboundIdentity } from "@relkit/invocation";
import type { DefineFunction } from "./define-function-types.js";
import {
  createFunctionDescriptor,
  type FunctionDescriptorFactoryOptions,
} from "./function-descriptor-factory.js";
import type { FunctionDependencies, FunctionDescriptor } from "./types.js";

type FunctionImplementationOptions = Omit<
  FunctionDescriptorFactoryOptions,
  "id" | "invocationMode"
> & { readonly id?: string };

export type {
  AgentClientFor,
  AgentClients,
  AgentRef,
  AgentRefAny,
  AuthContext,
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
): FunctionDescriptor<string, unknown, unknown, FunctionDependencies> => {
  const id = options.id === undefined ? createUnboundIdentity() : options.id;
  return createFunctionDescriptor({
    ...options,
    id,
    invocationMode: "callable",
  }) as FunctionDescriptor<string, unknown, unknown, FunctionDependencies>;
};
