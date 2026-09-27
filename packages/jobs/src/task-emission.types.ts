import type { NamedStreamFrame, ProgressEmitReceipt } from "@relkit/contracts/jobs";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
import type { TaskStreamSchemas } from "./task-core.types.js";

/** Emitter contract for task progress items. */
export interface TaskProgressEmitter<Value = unknown> {
  readonly emit: (value: Value) => Promise<ProgressEmitReceipt>;
}

/** Emitter contract for task stream items. */
export interface TaskStreamEmitter<Value = unknown> {
  readonly emit: (value: Value) => Promise<ProgressEmitReceipt>;
}

/** Validated item output inferred from a stream schema. */
export type TaskStreamItem<Schema extends StandardSchemaV1> = InferOutput<Schema>;
/** Input type inferred for task progress. */
export type TaskProgressInput<Schema extends StandardSchemaV1> = InferInput<Schema>;
/** Output type inferred for task progress. */
export type TaskProgressOutput<Schema extends StandardSchemaV1> = InferOutput<Schema>;
/** Input type inferred for task stream. */
export type TaskStreamInput<Schema extends StandardSchemaV1> = InferInput<Schema>;
/** Output type inferred for task stream. */
export type TaskStreamOutput<Schema extends StandardSchemaV1> = InferOutput<Schema>;
/** Named emitters whose input types follow each declared stream schema. */
export type TaskStreamEmitters<Streams extends TaskStreamSchemas> = {
  readonly [Name in keyof Streams & string]: TaskStreamEmitter<TaskStreamInput<Streams[Name]>>;
};
/** Discriminated frames for all declared task streams. */
export type TaskStreamFrames<Streams extends TaskStreamSchemas> = {
  readonly [Name in keyof Streams & string]: NamedStreamFrame<TaskStreamOutput<Streams[Name]>> & {
    readonly name: Name;
  };
}[keyof Streams & string];
