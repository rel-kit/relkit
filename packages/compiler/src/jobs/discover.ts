import { canonicalJson } from "@relkit/contracts";
import { add } from "../normalize-pass-utils.js";
import { isRecord, refId } from "../normalize-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "../normalize-types.js";
import { isCanonicalJobName } from "./names.js";

/** Deduplicates evaluator aliases and creates deterministic private implicit jobs. */
export function discoverTaskJobs(work: NormalizationWork): void {
  work.descriptors.push(...nestedServiceMembers(work));
  const sourceNames = new Map<string, Set<string>>();
  for (const task of work.descriptors.filter((entry) => entry.kind === "task")) {
    const names = sourceNames.get(task.id) ?? new Set<string>();
    for (const name of taskName(task)) names.add(name);
    sourceNames.set(task.id, names);
  }
  work.descriptors = deduplicateAliases(work.descriptors);
  const tasks = work.descriptors.filter((entry) => entry.kind === "task");
  const jobs = work.descriptors.filter((entry) => entry.kind === "job");
  for (const task of tasks) {
    const taskJobs = jobs.filter((job) => {
      const value = isRecord(job.value) ? job.value : {};
      return refId(value.task) === task.id;
    });
    if (taskJobs.length > 0) continue;
    const names = [...(sourceNames.get(task.id) ?? new Set<string>())];
    if (names.length !== 1 || !isCanonicalJobName(names[0])) {
      add(
        work,
        task,
        NORMALIZE_CODES.jobBinding,
        `Task "${task.id}" requires one explicit named job because its implicit export name is not unique.`,
      );
      continue;
    }
    work.descriptors.push(implicitJob(task, names[0]!));
  }
}

function nestedServiceMembers(work: NormalizationWork): NormalizedDescriptor[] {
  const nested: NormalizedDescriptor[] = [];
  for (const service of work.descriptors.filter((entry) => entry.kind === "service")) {
    const value = isRecord(service.value) ? service.value : {};
    for (const [member, target] of Object.entries(value)) {
      if (!isRecord(target)) continue;
      const kind = target.ref?.kind;
      if (kind !== "task" && kind !== "job") continue;
      const id = refId(target);
      if (id === undefined) continue;
      nested.push({
        kind,
        id,
        source: service.source,
        exportName: member,
        exportKind: "named",
        origin: { file: service.source.file, exportName: member, exportKind: "named" },
        value: target,
      });
    }
  }
  return nested;
}

function deduplicateAliases(descriptors: readonly NormalizedDescriptor[]): NormalizedDescriptor[] {
  const output: NormalizedDescriptor[] = [];
  for (const descriptor of descriptors) {
    if (descriptor.kind !== "task" && descriptor.kind !== "job") {
      output.push(descriptor);
      continue;
    }
    const previous = output.find(
      (entry) => entry.kind === descriptor.kind && entry.id === descriptor.id,
    );
    if (previous === undefined) {
      output.push(descriptor);
      continue;
    }
    if (descriptor.reference === undefined || previous.reference === undefined) {
      if (previous.reference === undefined && descriptor.reference !== undefined) {
        output[output.indexOf(previous)] = descriptor;
      }
      continue;
    }
    if (!sameValue(previous.value, descriptor.value)) {
      output.push(descriptor);
      continue;
    }
    if (canonicalRank(descriptor) < canonicalRank(previous))
      output[output.indexOf(previous)] = descriptor;
  }
  return output;
}

function taskName(task: NormalizedDescriptor): readonly string[] {
  if (task.reference === undefined) return [];
  const binding = task.exportFact?.binding ?? task.exportFact?.factory?.binding;
  const candidate = task.exportName === "default" ? binding : task.exportName;
  return candidate === undefined ? [] : [candidate];
}

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

function canonicalRank(descriptor: NormalizedDescriptor): number {
  return descriptor.exportName === "default" ? 1 : 0;
}

function sameValue(left: unknown, right: unknown): boolean {
  try {
    return canonicalJson(left) === canonicalJson(right);
  } catch {
    return false;
  }
}
