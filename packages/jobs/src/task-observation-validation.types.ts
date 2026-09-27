import type { TaskObservation, TaskStreamSchemas } from "./task-types.js";

export type { TaskObservation, TaskStreamSchemas } from "./task-types.js";

/** Declared schemas available to the task observation validator. */
export type ObservationStreams = TaskStreamSchemas | undefined;

/** Normalized observation configuration. */
export type NormalizedObservation = TaskObservation | undefined;
