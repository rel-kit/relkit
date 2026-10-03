import type { JobStoreIndex, JobStoreCheckpoint } from "./store.types.js";
import { Schema } from "effect";
import { JobIndexSchema, JobCheckpointSchema } from "./store.schemas.js";

/** Checks the persisted index version, commit and per-instance sequence/offset entries.
 * @param value - Value to validate, normalize or project.
 * @returns Whether the persisted index has valid version, commit and entry counters.
 */
export function isIndex(value: unknown): value is JobStoreIndex {
  return (
    Schema.is(JobIndexSchema)(value) &&
    Object.values(value.entries).every((entry) => entry.sequence > 0)
  );
}

/** Checks the persisted checkpoint version and nonnegative safe counters.
 * @param value - Value to validate, normalize or project.
 * @returns Whether the checkpoint has valid format identity and safe counters.
 */
export function isCheckpoint(value: unknown): value is JobStoreCheckpoint {
  return Schema.is(JobCheckpointSchema)(value);
}

/** Checks that a value is a nonnegative safe integer.
 * @param value - Value to validate, normalize or project.
 * @returns Whether the value is a nonnegative safe integer.
 */
export function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Checks for a non-null, non-array object before inspecting unknown fields.
 * @param value - Value to validate, normalize or project.
 * @returns Whether the value is a non-null, non-array object.
 */
export function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
