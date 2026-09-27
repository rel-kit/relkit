import type { MaybePromise } from "@relkit/contracts";
import type { ProgressEmitReceipt } from "@relkit/contracts/jobs";
import type { Effect } from "effect";
import type { TaskEmissionFailure } from "./task-progress-error.js";
/** Sink for a validated progress item. */
export type TaskEmissionSink = (
  value: unknown,
  signal: AbortSignal,
) => MaybePromise<ProgressEmitReceipt | void>;
/** Delivery and retention settings for a progress emitter. */
export interface TaskEmitterOptions {
  readonly signal?: AbortSignal;
  readonly sink?: TaskEmissionSink;
  readonly durable?: boolean;
  readonly maxBytes?: number;
  readonly generation?: string;
  readonly requireGeneration?: boolean;
}
/** Delivery settings for a named stream emitter. */
export interface TaskStreamEmitterOptions extends Omit<TaskEmitterOptions, "sink"> {
  readonly name: string;
  readonly sink?: TaskStreamSink;
}
/** Sink for a validated named stream item. */
export type TaskStreamSink = (
  value: unknown,
  signal: AbortSignal,
  identity: { readonly name: string; readonly generation?: string },
) => MaybePromise<ProgressEmitReceipt | void>;
/** Stable compatibility error codes for task emissions. */
export type TaskEmissionErrorCode =
  | "RELKIT_TASK_PROGRESS_INVALID"
  | "RELKIT_TASK_STREAM_INVALID"
  | "RELKIT_TASK_PROGRESS_TOO_LARGE"
  | "RELKIT_TASK_STREAM_TOO_LARGE"
  | "RELKIT_TASK_PROGRESS_PERSISTENCE"
  | "RELKIT_TASK_STREAM_PERSISTENCE"
  | "RELKIT_TASK_PROGRESS_RETENTION"
  | "RELKIT_TASK_STREAM_RETENTION"
  | "RELKIT_TASK_EMISSION_ABORTED";
/** An emitter with a typed Effect operation alongside its Promise adapter. */
export interface EffectTaskEmitter<Value> {
  readonly emit: (value: Value) => Promise<ProgressEmitReceipt>;
  readonly emitEffect: (value: Value) => Effect.Effect<ProgressEmitReceipt, TaskEmissionFailure>;
}
