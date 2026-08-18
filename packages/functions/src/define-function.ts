import { createDescriptorBase, deepFreeze, isRef, type DescriptorKind } from "@zsys/contracts";
import { type InferOutput, type StandardSchemaV1 } from "@zsys/schema";
import { isErrorDescriptor, type ErrorDescriptorAny } from "./define-error.js";
import type { DefineFunctionOptions, FunctionDependencies, FunctionDescriptor } from "./types.js";

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
  FunctionClientFor,
  FunctionClients,
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

export function defineFunction<
  const Id extends string,
  const InputSchema extends StandardSchemaV1,
  const OutputSchema extends StandardSchemaV1,
  const Dependencies extends FunctionDependencies = {},
  const Errors extends readonly ErrorDescriptorAny[] = readonly [],
>(
  options: DefineFunctionOptions<Id, InputSchema, OutputSchema, Dependencies, Errors>,
): FunctionDescriptor<
  Id,
  InferOutput<InputSchema>,
  InferOutput<OutputSchema>,
  Dependencies,
  Errors,
  InputSchema,
  OutputSchema
> {
  assertSchema(options.input, "input");
  assertSchema(options.output, "output");
  if (typeof options.handler !== "function") {
    throw new TypeError("Function handler must be a function");
  }
  validateLimit(options.timeoutMs, "timeoutMs");
  validateLimit(options.concurrency, "concurrency");
  const base = createDescriptorBase("function", options.id, options);
  const dependencies = copyDependencies(options.dependencies);
  const errors = copyErrors(options.errors);
  const descriptor = {
    ...base,
    input: options.input,
    output: options.output,
    ...(errors === undefined ? {} : { errors }),
    ...(dependencies === undefined ? {} : { dependencies }),
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
    handler: options.handler,
  };
  return deepFreeze(descriptor) as FunctionDescriptor<
    Id,
    InferOutput<InputSchema>,
    InferOutput<OutputSchema>,
    Dependencies,
    Errors,
    InputSchema,
    OutputSchema
  >;
}

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
  const result: Record<string, unknown> = {};
  const kinds: Readonly<Record<string, DescriptorKind>> = {
    functions: "function",
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
