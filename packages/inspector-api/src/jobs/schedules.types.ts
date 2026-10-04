import type { JsonValue } from "@relkit/contracts";
import type { InspectorJobsBinding } from "./types.js";

/** Signed schedule continuation state preserving exhaustion and native unavailability. */
export interface ScheduleCheckpoint {
  readonly state: "active" | "exhausted" | "unavailable";
  readonly cursor?: string;
  readonly reason?: string;
}

/** Native service-to-schedule checkpoint map retained across aggregate pages. */
export type SchedulePosition = Record<string, ScheduleCheckpoint>;

/** Native schedule receipt and the selected owning service binding. */
export interface ScheduleResult {
  readonly binding: InspectorJobsBinding;
  readonly receipt?: JsonValue;
  readonly checkpoint: ScheduleCheckpoint;
}
