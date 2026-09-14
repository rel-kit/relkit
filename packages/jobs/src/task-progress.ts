import type { MaybePromise } from "@relkit/contracts";
import type { ProgressEmitReceipt } from "@relkit/contracts/jobs";
import { canonicalJson } from "@relkit/contracts";
import { validate, type InferInput, type StandardSchemaV1 } from "@relkit/schema";
import { assertJobName } from "./job-name.js";
import { TASK_ITEM_MAX_BYTES } from "./task-policy-validation.js";
import type { TaskProgressEmitter, TaskStreamEmitter } from "./task-core-types.js";

export type TaskEmissionSink = (
  value: unknown,
  signal: AbortSignal,
) => MaybePromise<ProgressEmitReceipt | void>;

export interface TaskEmitterOptions {
  readonly signal?: AbortSignal;
  readonly sink?: TaskEmissionSink;
  readonly durable?: boolean;
  readonly maxBytes?: number;
}

export interface TaskStreamEmitterOptions extends Omit<TaskEmitterOptions, "sink"> {
  readonly name: string;
  readonly generation?: string;
  readonly sink?: TaskStreamSink;
}

export type TaskStreamSink = (
  value: unknown,
  signal: AbortSignal,
  identity: { readonly name: string; readonly generation?: string },
) => MaybePromise<ProgressEmitReceipt | void>;

export type TaskEmissionErrorCode =
  | "RELKIT_TASK_PROGRESS_INVALID"
  | "RELKIT_TASK_STREAM_INVALID"
  | "RELKIT_TASK_PROGRESS_TOO_LARGE"
  | "RELKIT_TASK_STREAM_TOO_LARGE"
  | "RELKIT_TASK_PROGRESS_PERSISTENCE"
  | "RELKIT_TASK_STREAM_PERSISTENCE"
  | "RELKIT_TASK_EMISSION_ABORTED";

export class TaskEmissionError extends TypeError {
  constructor(readonly code: TaskEmissionErrorCode, message: string) {
    super(message);
    this.name = "TaskEmissionError";
  }
}

export function createTaskProgressEmitter<S extends StandardSchemaV1>(
  schema: S,
  options: TaskEmitterOptions = {},
): TaskProgressEmitter<InferInput<S>> {
  return createEmitter(schema, options, "progress");
}

export function createTaskStreamEmitter<S extends StandardSchemaV1>(
  schema: S,
  options: TaskStreamEmitterOptions,
): TaskStreamEmitter<InferInput<S>> {
  assertJobName(options.name, "task stream name");
  const { sink, name, generation, ...baseOptions } = options;
  const emitterOptions: TaskEmitterOptions = {
    ...baseOptions,
    ...(sink === undefined
      ? {}
      : {
          sink: (value: unknown, signal: AbortSignal) =>
            sink(value, signal, { name, ...(generation === undefined ? {} : { generation }) }),
        }),
  };
  return createEmitter(
    schema,
    emitterOptions,
    "stream",
  );
}

function createEmitter<S extends StandardSchemaV1>(
  schema: S,
  options: TaskEmitterOptions,
  kind: "progress" | "stream",
): TaskProgressEmitter<InferInput<S>> {
  const maxBytes = options.maxBytes ?? TASK_ITEM_MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError("Emission byte limit must be positive");
  const invalidCode = kind === "progress" ? "RELKIT_TASK_PROGRESS_INVALID" : "RELKIT_TASK_STREAM_INVALID";
  const largeCode = kind === "progress" ? "RELKIT_TASK_PROGRESS_TOO_LARGE" : "RELKIT_TASK_STREAM_TOO_LARGE";
  const persistenceCode =
    kind === "progress" ? "RELKIT_TASK_PROGRESS_PERSISTENCE" : "RELKIT_TASK_STREAM_PERSISTENCE";
  const signal = options.signal ?? new AbortController().signal;
  return Object.freeze({
    emit: async (input: InferInput<S>) => {
      if (signal.aborted) throw new TaskEmissionError("RELKIT_TASK_EMISSION_ABORTED", "Emission was aborted");
      const value = await validated(schema, input, invalidCode);
      let encoded: string;
      try {
        encoded = canonicalJson(value);
      } catch (error) {
        throw new TaskEmissionError(invalidCode, message(error));
      }
      if (new TextEncoder().encode(encoded).byteLength > maxBytes) {
        throw new TaskEmissionError(largeCode, `${kind} item exceeds ${maxBytes} encoded bytes`);
      }
      if (options.sink === undefined) {
        if (options.durable) throw new TaskEmissionError(persistenceCode, `No durable ${kind} sink is configured`);
        return Object.freeze({ outcome: "unavailable" as const, reason: `No ${kind} sink is configured` });
      }
      try {
        const receipt = await options.sink(value, signal);
        const normalized = normalizeReceipt(receipt);
        if (options.durable && normalized.outcome !== "persisted") {
          throw new TaskEmissionError(persistenceCode, `Durable ${kind} emission was not persisted`);
        }
        return Object.freeze(normalized);
      } catch (error) {
        if (error instanceof TaskEmissionError) throw error;
        if (options.durable) throw new TaskEmissionError(persistenceCode, message(error));
        return Object.freeze({ outcome: "unavailable" as const, reason: message(error) });
      }
    },
  });
}

async function validated<S extends StandardSchemaV1>(
  schema: S,
  input: InferInput<S>,
  code: "RELKIT_TASK_PROGRESS_INVALID" | "RELKIT_TASK_STREAM_INVALID",
) {
  const result = await validate(schema, input);
  if (!("value" in result)) {
    throw new TaskEmissionError(code, result.issues[0]?.message ?? "Emission validation failed");
  }
  return result.value;
}

function normalizeReceipt(receipt: ProgressEmitReceipt | void): ProgressEmitReceipt {
  if (receipt === undefined) return { outcome: "sent" };
  if (!Object.hasOwn({ persisted: true, sent: true, dropped: true, unavailable: true }, receipt.outcome)) {
    throw new TypeError("Invalid task emission receipt");
  }
  return {
    outcome: receipt.outcome,
    ...(receipt.sequence === undefined ? {} : { sequence: receipt.sequence }),
    ...(receipt.generation === undefined ? {} : { generation: receipt.generation }),
    ...(receipt.reason === undefined ? {} : { reason: receipt.reason }),
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
