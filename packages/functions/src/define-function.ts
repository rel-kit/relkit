import { createUnboundIdentity } from "@relkit/invocation";
import { Effect } from "effect";
import type { DefineFunction, DefineFunctionEffect } from "./define-function.types.js";
import { createFunctionDescriptorEffect } from "./function-descriptor-factory.js";
import {
  FunctionOperationError,
  observeFunction,
  runFunctionSync,
} from "./function-observability.js";
import type { FunctionImplementationOptions } from "./define-function.types.js";
import type { FunctionDependencies, FunctionDescriptor } from "./types.js";

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
  TaskClientFor,
  TaskClients,
  TaskTriggerOptions,
  PublicClock,
  PublicLogger,
  ResolvedApplicationEnv,
} from "./types.js";

const defineFunctionOperation = Effect.fn("functions.function.define")(
  (
    options: FunctionImplementationOptions,
  ): Effect.Effect<
    FunctionDescriptor<string, unknown, unknown, FunctionDependencies>,
    FunctionOperationError
  > =>
    observeFunction(
      "function.define",
      Effect.gen(function* () {
        const id = yield* Effect.sync(() =>
          options.id === undefined ? createUnboundIdentity() : options.id,
        );
        return (yield* createFunctionDescriptorEffect({
          ...options,
          id,
          invocationMode: "callable",
        })) as FunctionDescriptor<string, unknown, unknown, FunctionDependencies>;
      }),
    ),
);

/** Defines a callable function through Effect.
 * @param options - Function schemas, handler, and metadata.
 * @returns Descriptor or tagged validation failure.
 * @example Effect.runSync(defineFunctionEffect({ input, output, handler }));
 */
export const defineFunctionEffect: DefineFunctionEffect = defineFunctionOperation;

/**
 * Defines the graph-visible executable unit shared by HTTP, background, tool, and agent calls.
 *
 * The `id` is optional for source-scoped functions; the compiler derives it from the
 * source/export hierarchy. Durable resources keep explicit IDs. The handler receives
 * validated reusable input and an invocation-scoped context. Use `descriptor.invoke(input)`
 * for nested calls so the
 * common engine preserves validation, service policy, limits, and telemetry.
 *
 * @param options - Function schemas, handler, and metadata.
 * @returns Frozen callable descriptor.
 * @throws TypeError for invalid definition inputs.
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
export const defineFunction: DefineFunction = (options: FunctionImplementationOptions) =>
  runFunctionSync(defineFunctionOperation(options));
