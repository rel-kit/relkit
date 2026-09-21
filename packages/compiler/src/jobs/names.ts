import { add } from "../normalize-pass-utils.js";
import { isRecord, refId, refKind } from "../normalize-utils.js";
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

export function isCanonicalJobName(value: unknown): value is string {
  return typeof value === "string" && NAME_PATTERN.test(value) && !RESERVED_NAMES.has(value);
}

/** Validates application-wide names and task binding shape after indexing. */
export function validateJobNames(work: NormalizationWork): void {
  const names = new Map<string, string>();
  const defaults = new Map<string, number>();
  for (const descriptor of work.descriptors.filter((entry) => entry.kind === "job")) {
    const value = isRecord(descriptor.value) ? descriptor.value : {};
    if (value.task === undefined) continue;
    const name = value.name;
    if (!isCanonicalJobName(name)) {
      add(work, descriptor, NORMALIZE_CODES.jobName, `Job name "${String(name)}" is invalid.`);
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
    if (refKind(task) !== "task" || refId(task) === undefined) {
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
    if (value.default === true && refId(task) !== undefined) {
      const taskId = refId(task)!;
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
  }
}
