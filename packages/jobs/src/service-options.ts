import { assertJsonValue, isStableId, type JsonValue } from "@relkit/contracts";
import type { DurationInput, MemoryInput } from "./task-core-types.js";
import {
  TASK_INPUT_MAX_BYTES,
  TASK_ITEM_MAX_BYTES,
  TASK_OUTPUT_MAX_BYTES,
  memoryBytes,
} from "./task-policy-validation.js";
import { durationToMillis } from "./duration.js";

export interface JobsServiceOptions {
  readonly limits?: {
    readonly inputBytes?: number;
    readonly outputBytes?: number;
    readonly progressItemBytes?: number;
    readonly streamItemBytes?: number;
  };
  readonly workers?: {
    readonly classes: readonly {
      readonly id: string;
      readonly cpu: number;
      readonly memory: MemoryInput;
      readonly nativeClass?: string;
    }[];
  };
  readonly observation?: { readonly pollInterval?: DurationInput; readonly readTimeout?: DurationInput };
  readonly maxElapsed?: DurationInput;
  readonly hookTimeout?: DurationInput;
  readonly shutdownGrace?: DurationInput;
}

export type JobsServiceBehavior = Readonly<Record<string, JsonValue>>;

export type JobsServiceOptionName =
  | "limits"
  | "workers"
  | "observation"
  | "maxElapsed"
  | "hookTimeout"
  | "shutdownGrace";

export function validateJobsServiceOptions(value: JobsServiceOptions | undefined): void {
  if (value === undefined) return;
  if (value.limits !== undefined) {
    assertLimit(value.limits.inputBytes, TASK_INPUT_MAX_BYTES, "limits.inputBytes");
    assertLimit(value.limits.outputBytes, TASK_OUTPUT_MAX_BYTES, "limits.outputBytes");
    assertLimit(value.limits.progressItemBytes, TASK_ITEM_MAX_BYTES, "limits.progressItemBytes");
    assertLimit(value.limits.streamItemBytes, TASK_ITEM_MAX_BYTES, "limits.streamItemBytes");
  }
  for (const [name, duration] of [
    ["maxElapsed", value.maxElapsed],
    ["hookTimeout", value.hookTimeout],
    ["shutdownGrace", value.shutdownGrace],
    ["observation.pollInterval", value.observation?.pollInterval],
    ["observation.readTimeout", value.observation?.readTimeout],
  ] as const) {
    if (duration !== undefined) {
      const milliseconds = durationToMillis(duration);
      if (milliseconds < 1) throw new TypeError(name + " must be positive");
      if (name === "observation.pollInterval" && milliseconds < 2_000) throw new TypeError(name + " must be at least 2 seconds");
      if (name === "observation.readTimeout" && milliseconds > 10_000) throw new TypeError(name + " must be at most 10 seconds");
    }
  }
  if (value.workers !== undefined) {
    const ids = new Set<string>();
    for (const worker of value.workers.classes) {
      if (!isStableId(worker.id) || ids.has(worker.id)) throw new TypeError("workers.classes ids must be unique stable ids");
      ids.add(worker.id);
      if (!Number.isFinite(worker.cpu) || worker.cpu <= 0) throw new TypeError("workers.classes.cpu must be positive");
      memoryBytes(worker.memory);
      if (worker.nativeClass !== undefined && !isStableId(worker.nativeClass)) throw new TypeError("workers.classes.nativeClass is invalid");
    }
  }
}

export function serializeJobsServiceOptions(
  value: JobsServiceOptions | undefined,
  native: JsonValue | undefined,
): Readonly<Record<string, JsonValue>> {
  const common: Record<string, JsonValue> = {};
  if (value?.limits !== undefined) common.limits = json(value.limits);
  if (value?.workers !== undefined) common.workers = json(value.workers);
  if (value?.observation !== undefined) common.observation = json(value.observation);
  if (value?.maxElapsed !== undefined) common.maxElapsed = json(value.maxElapsed);
  if (value?.hookTimeout !== undefined) common.hookTimeout = json(value.hookTimeout);
  if (value?.shutdownGrace !== undefined) common.shutdownGrace = json(value.shutdownGrace);
  if (native !== undefined) assertJsonValue(native);
  return Object.freeze({
    ...common,
    ...(native === undefined ? {} : { native }),
  });
}

export function deserializeJobsServiceOptions(value: unknown): JobsServiceOptions {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Jobs service behavior must be an object");
  }
  const { native: _native, ...common } = value as Record<string, unknown>;
  const options = common as JobsServiceOptions;
  validateJobsServiceOptions(options);
  return Object.freeze(options);
}

export function assertSupportedJobsServiceOptions(
  value: JobsServiceOptions,
  supported: readonly JobsServiceOptionName[],
): void {
  const allowed = new Set(supported);
  for (const name of ["limits", "workers", "observation", "maxElapsed", "hookTimeout", "shutdownGrace"] as const) {
    if (value[name] !== undefined && !allowed.has(name)) {
      throw new Error(`RELKIT_JOBS_SERVICE_OPTION_UNSUPPORTED:${name}`);
    }
  }
}

function json(value: unknown): JsonValue {
  assertJsonValue(value);
  return value;
}

function assertLimit(value: number | undefined, maximum: number, name: string): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 1 || value > maximum)) {
    throw new TypeError(name + " must be a positive integer no greater than " + maximum);
  }
}
