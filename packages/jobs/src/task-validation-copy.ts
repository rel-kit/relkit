import type { ErrorDescriptorAny } from "@relkit/functions";
import { Effect } from "effect";
import type { DurationInput } from "./duration.js";
import type {
  NormalizedTaskRetryPolicy,
  TaskDependencies,
  TaskStreamSchemas,
} from "./task-types.js";
import {
  normalizeRetry as normalizeRetryValue,
  duration as durationValue,
} from "./task-validation-value.js";
import {
  copyDependencies as copyDependenciesValue,
  copyErrors as copyErrorsValue,
  copyStreams as copyStreamsValue,
} from "./task-validation-value-copy.js";
import { runTaskValidation, taskValidationEffect } from "./task-validation-run.js";
/** Normalizes a task retry policy in Effect.
 * @param value - Candidate retry policy.
 * @returns Frozen policy or TaskValidationFailure.
 * @example Effect.runSync(normalizeRetryEffect({ maxAttempts: 3 }));
 */
export const normalizeRetryEffect = Effect.fn("Jobs.normalizeTaskRetry")((value: unknown) =>
  taskValidationEffect("taskValidation.retry", () => normalizeRetryValue(value)),
);
/** Synchronous retry policy normalizer.
 * @param value - Candidate retry policy.
 * @returns Frozen normalized policy.
 * @throws TypeError for invalid retry settings.
 * @example normalizeRetry({ maxAttempts: 3 });
 */
export function normalizeRetry(value: unknown): NormalizedTaskRetryPolicy {
  return runTaskValidation(normalizeRetryEffect(value));
}
/** Copies declared task dependencies in Effect.
 * @param value - Candidate dependency map.
 * @returns Frozen dependencies or TaskValidationFailure.
 * @example Effect.runSync(copyDependenciesEffect({ tasks: {} }));
 */
export const copyDependenciesEffect = Effect.fn("Jobs.copyTaskDependencies")(
  <Dependencies extends TaskDependencies>(value: unknown) =>
    taskValidationEffect("taskValidation.dependencies", () =>
      copyDependenciesValue<Dependencies>(value),
    ),
);
/** Synchronous dependency map copier.
 * @param value - Candidate dependency map.
 * @returns Frozen dependencies when provided.
 * @throws TypeError for invalid dependencies.
 * @example copyDependencies({ tasks: {} });
 */
export function copyDependencies<Dependencies extends TaskDependencies>(
  value: unknown,
): Dependencies | undefined {
  return runTaskValidation(copyDependenciesEffect<Dependencies>(value));
}
/** Copies declared task errors in Effect.
 * @param value - Candidate error descriptors.
 * @returns Frozen unique error descriptors or TaskValidationFailure.
 * @example Effect.runSync(copyErrorsEffect([]));
 */
export const copyErrorsEffect = Effect.fn("Jobs.copyTaskErrors")((value: unknown) =>
  taskValidationEffect("taskValidation.errors", () => copyErrorsValue(value)),
);
/** Synchronous task error descriptor copier.
 * @param value - Candidate error descriptors.
 * @returns Frozen unique descriptors when provided.
 * @throws TypeError for invalid descriptors.
 * @example copyErrors([]);
 */
export function copyErrors(value: unknown): readonly ErrorDescriptorAny[] | undefined {
  return runTaskValidation(copyErrorsEffect(value));
}
/** Copies named task stream schemas in Effect.
 * @param value - Candidate stream schema map.
 * @returns Frozen map or TaskValidationFailure.
 * @example Effect.runSync(copyStreamsEffect({ text: z.string() }));
 */
export const copyStreamsEffect = Effect.fn("Jobs.copyTaskStreams")((value: unknown) =>
  taskValidationEffect("taskValidation.streams", () => copyStreamsValue(value)),
);
/** Synchronous stream schema copier.
 * @param value - Candidate stream schema map.
 * @returns Frozen stream map when provided.
 * @throws TypeError for invalid stream names or schemas.
 * @example copyStreams({ text: z.string() });
 */
export function copyStreams(value: unknown): TaskStreamSchemas | undefined {
  return runTaskValidation(copyStreamsEffect(value));
}
/** Validates a readable task duration in Effect.
 * @param value - Candidate duration.
 * @param name - Diagnostic field name.
 * @param positive - Require a positive duration.
 * @returns Valid duration or TaskValidationFailure.
 * @example Effect.runSync(taskDurationEffect("1 second", "maxDuration", true));
 */
export const taskDurationEffect = Effect.fn("Jobs.taskDuration")(
  (value: unknown, name: string, positive = false) =>
    taskValidationEffect("taskValidation.duration", () => durationValue(value, name, positive)),
);
/** Synchronous task duration validator.
 * @param value - Candidate duration.
 * @param name - Diagnostic field name.
 * @param positive - Require a positive duration.
 * @returns Valid readable duration.
 * @throws TypeError for invalid duration.
 * @example duration("1 second", "maxDuration", true);
 */
export function duration(value: unknown, name: string, positive = false): DurationInput {
  return runTaskValidation(taskDurationEffect(value, name, positive));
}
