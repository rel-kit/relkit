import type { Effect } from "effect";
import type { RunPage, RunSnapshot } from "@relkit/contracts/jobs";
import type { JsonValue } from "@relkit/contracts";
import type { ResolvedActiveGeneration } from "../shared.js";
import type { InspectorJobsBinding } from "./types.js";
import type { AggregatePosition, Checkpoint } from "./run-aggregate-support.js";
import type { InspectorRunFilters } from "./filters.js";
import type { ScheduleCheckpoint, SchedulePosition } from "./schedules.js";

/** One native run page and its retained aggregate checkpoint. */
export interface NativeRunPage {
  readonly binding: InspectorJobsBinding;
  readonly page?: RunPage<RunSnapshot>;
  readonly state: Checkpoint;
  readonly reason?: string;
}

/** One native schedule receipt and availability checkpoint. */
export interface NativeSchedulePage {
  readonly binding: InspectorJobsBinding;
  readonly receipt?: JsonValue;
  readonly checkpoint: ScheduleCheckpoint;
}

/** Health result with truthful native availability, retaining declaration order. */
export interface NativeHealthPage {
  readonly binding: InspectorJobsBinding;
  readonly health: JsonValue;
  readonly available: boolean;
}

/** Ordered bounded native-job query capabilities. */
export interface InspectorNativeJobsService {
  readonly healthPages: (
    bindings: readonly InspectorJobsBinding[],
    concurrency?: number,
  ) => Effect.Effect<readonly NativeHealthPage[]>;
  readonly runPages: (
    generation: ResolvedActiveGeneration,
    request: Request,
    filters: InspectorRunFilters,
    bindings: readonly InspectorJobsBinding[],
    position: AggregatePosition,
  ) => Effect.Effect<readonly NativeRunPage[], import("./types.js").InspectorJobsError>;
  readonly schedulePages: (
    generation: ResolvedActiveGeneration,
    request: Request,
    limit: number,
    bindings: readonly InspectorJobsBinding[],
    position: SchedulePosition,
  ) => Effect.Effect<readonly NativeSchedulePage[]>;
}
