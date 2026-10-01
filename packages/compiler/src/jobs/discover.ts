import { Effect } from "effect";
import { runJobsSync } from "./compatibility.js";
import { observeJobs, recordJobsWorkload } from "./observability.js";
import { taskReferenceIdEffect } from "./reference.js";
import { serializeJsonEffect } from "@relkit/contracts";
import { add } from "../normalize-pass-utils.js";
import { isRecord } from "../normalize-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "../normalize-types.js";
import { isCanonicalJobName } from "./names.js";

/**
 * Deduplicates evaluated aliases and creates private implicit jobs for uniquely named tasks.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @returns A lazy effect yielding void after updating descriptors and appending binding diagnostics.
 * @remarks Requires no services. Unexpected exceptions remain defects.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { discoverTaskJobsEffect } from "./discover.js";
 * // work is a caller-owned normalization workspace; run name validation after indexing in a full compilation.
 * const discovery = discoverTaskJobsEffect(work);
 * Effect.runSync(discovery);
 * ```
 */
export const discoverTaskJobsEffect = Effect.fn("Jobs.discoverTaskJobs")(
  function* (work: NormalizationWork) {
    work.descriptors.push(...(yield* nestedServiceMembersEffect(work)));
    const sourceNames = new Map<string, Set<string>>();
    for (const task of work.descriptors.filter((entry) => entry.kind === "task")) {
      const names = sourceNames.get(task.id) ?? new Set<string>();
      for (const name of taskName(task)) names.add(name);
      sourceNames.set(task.id, names);
    }
    work.descriptors = yield* deduplicateAliasesEffect(work.descriptors);
    const tasks = work.descriptors.filter((entry) => entry.kind === "task");
    const jobs = work.descriptors.filter((entry) => entry.kind === "job");
    yield* Effect.forEach(
      tasks,
      (task) =>
        Effect.gen(function* () {
          const taskIds = yield* Effect.forEach(jobs, (job) =>
            taskReferenceIdEffect(isRecord(job.value) ? job.value.task : undefined),
          );
          if (taskIds.some((id) => id === task.id)) return;
          const names = [...(sourceNames.get(task.id) ?? new Set<string>())];
          if (names.length !== 1 || !isCanonicalJobName(names[0])) {
            add(
              work,
              task,
              NORMALIZE_CODES.jobBinding,
              `Task "${task.id}" requires one explicit named job because its implicit export name is not unique.`,
            );
            return;
          }
          work.descriptors.push(implicitJob(task, names[0] ?? ""));
        }),
      { discard: true },
    );
    yield* recordJobsWorkload("discover", {
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    });
  },
  (effect) => observeJobs("discover", effect),
);

/**
 * Deduplicates evaluated aliases and creates private implicit jobs for uniquely named tasks.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @returns void after updating descriptors and appending binding diagnostics.
 * @see {@link discoverTaskJobsEffect} for composition and execution examples.
 */
export function discoverTaskJobs(work: NormalizationWork): void {
  return runJobsSync(discoverTaskJobsEffect(work));
}

/**
 * Collects task and job descriptors exported as service members.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @returns A lazy effect yielding the nested descriptors with their service source provenance.
 * @remarks Requires no services. Unresolved references are skipped; unexpected exceptions remain defects.
 */
const nestedServiceMembersEffect = Effect.fn("Jobs.nestedServiceMembers")(function* (
  work: NormalizationWork,
) {
  const nested: NormalizedDescriptor[] = [];
  yield* Effect.forEach(
    work.descriptors.filter((entry) => entry.kind === "service"),
    (service) =>
      Effect.gen(function* () {
        const value = isRecord(service.value) ? service.value : {};
        yield* Effect.forEach(
          Object.entries(value),
          ([member, target]) =>
            Effect.gen(function* () {
              if (!isRecord(target)) return;
              const kind = target.ref?.kind;
              if (kind !== "task" && kind !== "job") return;
              const id = yield* taskReferenceIdEffect(target);
              if (id === undefined) return;
              nested.push({
                kind,
                id,
                source: service.source,
                exportName: member,
                exportKind: "named",
                origin: { file: service.source.file, exportName: member, exportKind: "named" },
                value: target,
              });
            }),
          { discard: true },
        );
      }),
    { discard: true },
  );
  return nested;
});

/**
 * Chooses canonical task/job aliases while retaining conflicting descriptor values.
 * @param descriptors - Evaluated descriptors in discovery order.
 * @returns A lazy effect yielding deduplicated descriptors in original discovery order.
 */
const deduplicateAliasesEffect = Effect.fn("Jobs.deduplicateAliases")(function* (
  descriptors: readonly NormalizedDescriptor[],
) {
  const output: NormalizedDescriptor[] = [];
  yield* Effect.forEach(
    descriptors,
    (descriptor) =>
      Effect.gen(function* () {
        if (descriptor.kind !== "task" && descriptor.kind !== "job") {
          output.push(descriptor);
          return;
        }
        const previous = output.find(
          (entry) => entry.kind === descriptor.kind && entry.id === descriptor.id,
        );
        if (previous === undefined) {
          output.push(descriptor);
          return;
        }
        if (descriptor.reference === undefined || previous.reference === undefined) {
          if (previous.reference === undefined && descriptor.reference !== undefined) {
            output[output.indexOf(previous)] = descriptor;
          }
          return;
        }
        if (!(yield* sameValueEffect(previous.value, descriptor.value))) {
          output.push(descriptor);
          return;
        }
        if (canonicalRank(descriptor) < canonicalRank(previous))
          output[output.indexOf(previous)] = descriptor;
      }),
    { discard: true },
  );
  return output;
});

/**
 * Finds the exported name used to infer a private task job.
 * @param task - Normalized task descriptor being projected or checked.
 * @returns the single candidate name or an empty array.
 */
function taskName(task: NormalizedDescriptor): readonly string[] {
  if (task.reference === undefined) return [];
  const binding = task.exportFact?.binding ?? task.exportFact?.factory?.binding;
  const candidate = task.exportName === "default" ? binding : task.exportName;
  return candidate === undefined ? [] : [candidate];
}

/**
 * Builds a private default binding for one uniquely named task.
 * @param task - Normalized task descriptor being projected or checked.
 * @param name - Unique canonical export name for the implicit job.
 * @returns the implicit job descriptor preserving task provenance.
 */
function implicitJob(task: NormalizedDescriptor, name: string): NormalizedDescriptor {
  const taskValue = isRecord(task.value) ? task.value : {};
  const value = {
    kind: "job",
    id: task.id,
    ref: { kind: "job", id: task.id },
    name,
    task: taskValue,
    input: taskValue.input,
    output: taskValue.output,
    ...(taskValue.errors === undefined ? {} : { errors: taskValue.errors }),
    ...(taskValue.execution === undefined ? {} : { execution: taskValue.execution }),
    ...(taskValue.version === undefined ? {} : { version: taskValue.version }),
    implicit: true,
    private: true,
    default: true,
  };
  return {
    kind: "job",
    id: task.id,
    source: task.source,
    exportName: name,
    exportKind: "named",
    identity: "explicit",
    ...(task.facts === undefined ? {} : { facts: task.facts }),
    ...(task.origin === undefined ? {} : { origin: task.origin }),
    value,
  };
}

/**
 * Prefers named exports when equivalent evaluator aliases compete.
 * @param descriptor - Descriptor whose identity or source is being inspected.
 * @returns zero for named exports and one for default exports.
 */
function canonicalRank(descriptor: NormalizedDescriptor): number {
  return descriptor.exportName === "default" ? 1 : 0;
}

/**
 * Compares canonical descriptor projections for alias deduplication.
 * @param left - First value or descriptor to compare.
 * @param right - Second value or descriptor to compare.
 * @returns A lazy effect yielding whether both values serialize to the same canonical JSON.
 * @remarks Unserializable descriptor values intentionally remain separate aliases.
 */
const sameValueEffect = Effect.fn("Jobs.sameValue")(function* (left: unknown, right: unknown) {
  return yield* Effect.gen(function* () {
    const a = yield* serializeJsonEffect(left);
    const b = yield* serializeJsonEffect(right);
    return a === b;
  }).pipe(Effect.catchTag("JsonValueError", () => Effect.succeed(false)));
});
