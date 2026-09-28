import type { TaskRef } from "@relkit/contracts/jobs";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";

/** Caller input inferred from a task's input schema. */
export type TaskInput<T extends TaskRef> = T extends { readonly input: infer Schema }
  ? Schema extends StandardSchemaV1
    ? InferInput<Schema>
    : unknown
  : unknown;
/** Validated output inferred from a task's output schema. */
export type TaskOutput<T extends TaskRef> = T extends { readonly output: infer Schema }
  ? Schema extends StandardSchemaV1
    ? InferOutput<Schema>
    : unknown
  : unknown;

/** Caller-facing input alias for a task reference. */
export type TaskCallerInput<T extends TaskRef> = TaskInput<T>;
/** Parsed canonical input inferred from a task's input schema. */
export type TaskCanonicalInput<T extends TaskRef> = T extends { readonly input: infer Schema }
  ? Schema extends StandardSchemaV1
    ? InferOutput<Schema>
    : unknown
  : unknown;
/** Handler return value accepted by a task's output schema. */
export type TaskRawHandlerOutput<T extends TaskRef> = T extends { readonly output: infer Schema }
  ? Schema extends StandardSchemaV1
    ? InferInput<Schema>
    : unknown
  : unknown;
/** Output after validation through a task's output schema. */
export type TaskValidatedOutput<T extends TaskRef> = TaskOutput<T>;
