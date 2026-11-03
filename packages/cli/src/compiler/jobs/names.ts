import { Effect } from "effect";
import { runJobsSync } from "./compatibility.js";
import { observeJobs, recordJobsWorkload } from "./observability.js";
import { taskReferenceIdEffect } from "./reference.js";
import { add } from "../normalize-pass-utils.js";
import { isRecord, refKind } from "../normalize-utils.js";
import { NORMALIZE_CODES, type NormalizationWork } from "../normalize-types.js";

const NAME_PATTERN = /^[a-z][A-Za-z0-9]{0,63}$/u;
const RESERVED_NAMES = new Set([
  "then",
  "constructor",
  "prototype",
  "toJSON",
  "toString",
  "valueOf",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString",
  "__proto__",
]);

/**
 * Checks generated-client-safe job naming and reserved property names.
 * @param value - Value or descriptor to inspect without coercion.
 * @returns whether value is a supported canonical job name.
 */
export function isCanonicalJobName(value: unknown): value is string {
  return typeof value === "string" && NAME_PATTERN.test(value) && !RESERVED_NAMES.has(value);
}

/**
 * Validates application-wide job names, task bindings, and default uniqueness.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @returns A lazy effect yielding void after appending all discovered name and binding diagnostics.
 * @remarks Requires no services. Unexpected exceptions remain defects.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { validateJobNamesEffect } from "./names.js";
 * // work has already been indexed; findings accumulate in work.diagnostics.
 * Effect.runSync(validateJobNamesEffect(work));
 * ```
 */
export const validateJobNamesEffect = Effect.fn("Jobs.validateJobNames")(
  function* (work: NormalizationWork) {
    const names = new Map<string, string>();
    const defaults = new Map<string, number>();
    yield* Effect.forEach(
      work.descriptors.filter((entry) => entry.kind === "job"),
      (descriptor) =>
        Effect.gen(function* () {
          const value = isRecord(descriptor.value) ? descriptor.value : {};
          if (value.task === undefined) return;
          const name = value.name;
          if (!isCanonicalJobName(name)) {
            add(
              work,
              descriptor,
              NORMALIZE_CODES.jobName,
              `Job name "${String(name)}" is invalid.`,
            );
          } else {
            const previous = names.get(name);
            if (previous !== undefined && previous !== descriptor.id) {
              add(
                work,
                descriptor,
                NORMALIZE_CODES.jobName,
                `Job name "${name}" is already used by "${previous}".`,
              );
            } else names.set(name, descriptor.id);
          }
          const task = value.task;
          const taskId = yield* taskReferenceIdEffect(task);
          if (refKind(task) !== "task" || taskId === undefined) {
            add(
              work,
              descriptor,
              NORMALIZE_CODES.jobTask,
              "Task-target jobs must reference a task descriptor.",
            );
          }
          if (value.target !== undefined) {
            add(
              work,
              descriptor,
              NORMALIZE_CODES.jobTask,
              "New jobs cannot target functions; bind a task instead.",
            );
          }
          if (value.default === true && taskId !== undefined) {
            const count = (defaults.get(taskId) ?? 0) + 1;
            defaults.set(taskId, count);
            if (count > 1)
              add(
                work,
                descriptor,
                NORMALIZE_CODES.jobBinding,
                `Task "${taskId}" has more than one default job.`,
              );
          }
        }),
      { discard: true },
    );
    yield* recordJobsWorkload("validateNames", {
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    });
  },
  (effect) => observeJobs("validateNames", effect),
);

/**
 * Validates application-wide job names, task bindings, and default uniqueness.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @returns void after appending all discovered name and binding diagnostics.
 * @see {@link validateJobNamesEffect} for composition and execution examples.
 */
export function validateJobNames(work: NormalizationWork): void {
  return runJobsSync(validateJobNamesEffect(work));
}
