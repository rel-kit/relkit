import type { StandardSchemaV1 } from "@relkit/schema";
import { Effect } from "effect";
import type { TaskConcurrency, TaskLogging, TaskResources } from "./task-types.js";
import {
  copyTaskTags as copyTaskTagsValue,
  copyResources as copyResourcesValue,
  copyConcurrency as copyConcurrencyValue,
  copyLogging as copyLoggingValue,
} from "./task-policy-value.js";
import { runTaskValidation, taskValidationEffect } from "./task-validation-run.js";
/** Copies bounded unique task tags in Effect.
 * @param value - Candidate tags.
 * @returns Frozen tags or TaskValidationFailure.
 * @example Effect.runSync(copyTaskTagsEffect(["important"]));
 */
export const copyTaskTagsEffect = Effect.fn("Jobs.copyTaskTags")((value: unknown) =>
  taskValidationEffect("taskPolicy.tags", () => copyTaskTagsValue(value)),
);
/** Synchronous task tag copier.
 * @param value - Candidate tags.
 * @returns Frozen tags when provided.
 * @throws TypeError for invalid or duplicate tags.
 * @example copyTaskTags(["important"]);
 */
export function copyTaskTags(value: unknown): readonly string[] | undefined {
  return runTaskValidation(copyTaskTagsEffect(value));
}
/** Copies validated CPU and memory settings in Effect.
 * @param value - Candidate resources.
 * @returns Frozen resources or TaskValidationFailure.
 * @example Effect.runSync(copyResourcesEffect({ cpu: 1, memory: "1 GiB" }));
 */
export const copyResourcesEffect = Effect.fn("Jobs.copyTaskResources")((value: unknown) =>
  taskValidationEffect("taskPolicy.resources", () => copyResourcesValue(value)),
);
/** Synchronous task resource copier.
 * @param value - Candidate resources.
 * @returns Frozen resources when provided.
 * @throws TypeError for invalid CPU or memory settings.
 * @example copyResources({ cpu: 1, memory: "1 GiB" });
 */
export function copyResources(value: unknown): TaskResources | undefined {
  return runTaskValidation(copyResourcesEffect(value));
}
/** Copies bounded concurrency settings in Effect.
 * @param value - Candidate concurrency policy.
 * @param canonicalSchema - Optional schema for the key.
 * @returns Frozen concurrency or TaskValidationFailure.
 * @example Effect.runSync(copyConcurrencyEffect({ limit: 2 }));
 */
export const copyConcurrencyEffect = Effect.fn("Jobs.copyTaskConcurrency")(
  (value: unknown, canonicalSchema?: StandardSchemaV1) =>
    taskValidationEffect("taskPolicy.concurrency", () =>
      copyConcurrencyValue(value, canonicalSchema),
    ),
);
/** Synchronous task concurrency copier.
 * @param value - Candidate concurrency policy.
 * @param canonicalSchema - Optional schema for the key.
 * @returns Frozen concurrency when provided.
 * @throws TypeError for invalid concurrency settings.
 * @example copyConcurrency({ limit: 2 });
 */
export function copyConcurrency(
  value: unknown,
  canonicalSchema?: StandardSchemaV1,
): TaskConcurrency | undefined {
  return runTaskValidation(copyConcurrencyEffect(value, canonicalSchema));
}
/** Copies bounded logging settings in Effect.
 * @param value - Candidate logging policy.
 * @returns Frozen logging settings or TaskValidationFailure.
 * @example Effect.runSync(copyLoggingEffect({ level: "info" }));
 */
export const copyLoggingEffect = Effect.fn("Jobs.copyTaskLogging")((value: unknown) =>
  taskValidationEffect("taskPolicy.logging", () => copyLoggingValue(value)),
);
/** Synchronous logging policy copier.
 * @param value - Candidate logging policy.
 * @returns Frozen logging settings when provided.
 * @throws TypeError for invalid logging policy.
 * @example copyLogging({ level: "info" });
 */
export function copyLogging(value: unknown): TaskLogging | undefined {
  return runTaskValidation(copyLoggingEffect(value));
}
