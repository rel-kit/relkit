import { isErrorDescriptor } from "@relkit/functions";
import { isRef, normalizeId } from "@relkit/contracts";
import type { ErrorDescriptorAny } from "@relkit/functions";
import { getJsonSchema, isSchemaTransformed, type StandardSchemaV1 } from "@relkit/schema";
import { durationToMillis, type DurationInput } from "./duration.js";
import { assertCanonicalProjection } from "./canonical-support.js";
import { assertJobName } from "./job-name.js";
import type {
  NormalizedTaskRetryPolicy,
  TaskDependencies,
  TaskObservation,
  TaskRetryPolicy,
  TaskStreamSchemas,
} from "./task-types.js";

export function assertSchema(value: unknown, name: string): asserts value is StandardSchemaV1 {
  if (
    !isRecord(value) ||
    !isRecord(value["~standard"]) ||
    value["~standard"].version !== 1 ||
    typeof value["~standard"].validate !== "function"
  ) {
    throw new TypeError(`${name} must be a Standard Schema v1 validator`);
  }
}

export function normalizeVersion(value: unknown): string {
  return normalizeId(value);
}

export function assertInputWireSupport(input: StandardSchemaV1, inputWire: unknown): void {
  if (inputWire !== undefined) {
    assertSchema(inputWire, "Task inputWire");
    assertCanonicalSchemaSupport(inputWire, "Task inputWire", true);
    return;
  }
  const inputProjection = getJsonSchema(input, { direction: "input" });
  const outputProjection = getJsonSchema(input, { direction: "output" });
  if (isSchemaTransformed(input) || (inputProjection.ok && !outputProjection.ok)) {
    throw new TypeError("Transformed task inputs require an identity-preserving inputWire schema");
  }
  if (outputProjection.ok) assertCanonicalProjection(outputProjection.schema, "Task input", true);
}

export function assertCanonicalSchemaSupport(schema: StandardSchemaV1, name: string, allowVoid = false): void {
  if (isSchemaTransformed(schema)) {
    throw new TypeError(`${name} must validate canonical values without a transformation`);
  }
  const projection = getJsonSchema(schema, { direction: "output" });
  if (!projection.ok) throw new TypeError(`${name} has no faithful canonical validator`);
  assertCanonicalProjection(projection.schema, name, allowVoid);
}

export function assertCanonicalStreamSupport(streams: TaskStreamSchemas | undefined): void {
  for (const [name, schema] of Object.entries(streams ?? {})) {
    assertCanonicalSchemaSupport(schema, `Task stream "${name}"`);
  }
}

export function normalizeRetry(value: unknown): NormalizedTaskRetryPolicy {
  const input = value === undefined ? {} : value;
  if (!isRecord(input)) throw new TypeError("Task retry policy must be an object");
  const maxAttemptsValue = input.maxAttempts;
  const maxAttempts = maxAttemptsValue === undefined ? 3 : maxAttemptsValue;
  if (typeof maxAttempts !== "number" || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new TypeError("retry.maxAttempts must be a positive integer");
  }
  const initialDelay = duration(input.initialDelay ?? "1 second", "retry.initialDelay");
  const maxDelay = duration(input.maxDelay ?? "30 seconds", "retry.maxDelay");
  if (durationToMillis(initialDelay) > durationToMillis(maxDelay)) {
    throw new TypeError("retry.initialDelay must be at most retry.maxDelay");
  }
  const factor = input.factor ?? 2;
  if (typeof factor !== "number" || !Number.isFinite(factor) || factor < 1) {
    throw new TypeError("retry.factor must be a finite number at least 1");
  }
  const jitter = input.jitter ?? "none";
  if (jitter !== "none" && jitter !== "full") {
    throw new TypeError('retry.jitter must be "none" or "full"');
  }
  return Object.freeze({ maxAttempts, initialDelay, maxDelay, factor, jitter });
}

export function copyDependencies<Dependencies extends TaskDependencies>(
  value: unknown,
): Dependencies | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new TypeError("Task dependencies must be an object");
  if (hasOwn(value, "functions") || hasOwn(value, "events")) {
    throw new TypeError("Task dependencies support tasks, jobs, agents, buckets, and cache only");
  }
  const kinds = { tasks: "task", jobs: "job", agents: "agent", buckets: "bucket", cache: "cache" } as const;
  if (Object.keys(value).some((category) => !(category in kinds))) {
    throw new TypeError("Task dependencies contain an unsupported category");
  }
  const result: Record<string, Readonly<Record<string, unknown>>> = {};
  for (const [category, kind] of Object.entries(kinds)) {
    const map = value[category];
    if (map === undefined) continue;
    if (!isRecord(map)) throw new TypeError(`Task dependency map "${category}" must be an object`);
    const copied: Record<string, unknown> = {};
    for (const [name, target] of Object.entries(map)) {
      assertJobName(name, `task ${category} dependency name`);
      if (!isRecord(target) || !isRef(target.ref, kind)) {
        throw new TypeError(`Invalid ${category} dependency "${name}"`);
      }
      copied[name] = target;
    }
    result[category] = Object.freeze(copied);
  }
  return Object.freeze(result) as unknown as Dependencies;
}

export function copyErrors(value: unknown): readonly ErrorDescriptorAny[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((entry) => !isErrorDescriptor(entry))) {
    throw new TypeError("Task errors must be declared error descriptors");
  }
  if (new Set(value.map((entry) => entry.id)).size !== value.length) {
    throw new TypeError("Task errors must have unique IDs");
  }
  return Object.freeze([...value]) as readonly ErrorDescriptorAny[];
}

export function copyStreams(value: unknown): TaskStreamSchemas | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new TypeError("Task streams must be an object");
  const result: Record<string, StandardSchemaV1> = {};
  for (const [name, schema] of Object.entries(value)) {
    assertJobName(name, "task stream name");
    assertSchema(schema, `task stream "${name}"`);
    result[name] = schema;
  }
  return Object.freeze(result);
}

export function copyObservation(
  value: unknown,
  progress: unknown,
  streams: TaskStreamSchemas | undefined,
): TaskObservation | undefined {
  const declaredStreamNames = streams === undefined ? [] : Object.keys(streams);
  if (value === undefined) {
    if (progress === undefined && declaredStreamNames.length === 0) return undefined;
    return Object.freeze({
      ...(progress === undefined ? {} : { progress: "live" as const }),
      ...(declaredStreamNames.length === 0
        ? {}
        : {
            streams: Object.freeze(
              Object.fromEntries(declaredStreamNames.map((name) => [name, "live" as const])),
            ),
          }),
    }) as TaskObservation;
  }
  if (!isRecord(value)) throw new TypeError("Task observation must be an object");
  if (value.progress !== undefined && value.progress !== "live" && value.progress !== "durable") {
    throw new TypeError('observation.progress must be "live" or "durable"');
  }
  if (value.progress !== undefined && progress === undefined) {
    throw new TypeError("Progress observation requires a progress schema");
  }
  let observedStreams: Record<string, "live" | "history"> | undefined;
  if (value.streams !== undefined) {
    if (!isRecord(value.streams) || streams === undefined) {
      throw new TypeError("Observed streams require declared task stream schemas");
    }
    observedStreams = {};
    for (const [name, guarantee] of Object.entries(value.streams)) {
      if (!(name in streams)) throw new TypeError(`Undeclared observed stream "${name}"`);
      if (guarantee !== "live" && guarantee !== "history") {
        throw new TypeError(`Invalid observation guarantee for stream "${name}"`);
      }
      observedStreams[name] = guarantee;
    }
  } else if (declaredStreamNames.length > 0) {
    observedStreams = Object.fromEntries(declaredStreamNames.map((name) => [name, "live" as const]));
  }
  return Object.freeze({
    ...(value.progress === undefined
      ? progress === undefined
        ? {}
        : { progress: "live" as const }
      : { progress: value.progress }),
    ...(observedStreams === undefined ? {} : { streams: Object.freeze(observedStreams) }),
  }) as TaskObservation;
}
export function duration(value: unknown, name: string, positive = false): DurationInput {
  if (typeof value !== "string") throw new TypeError(`${name} must be a readable duration`);
  const milliseconds = durationToMillis(value as DurationInput);
  if (positive && milliseconds < 1) throw new TypeError(`${name} must be positive`);
  return value as DurationInput;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
export { copyConcurrency, copyLogging, copyResources } from "./task-policy-validation.js";
