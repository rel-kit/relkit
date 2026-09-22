import {
  JOBS_MANIFEST_PROTOCOL,
  JOBS_MANIFEST_VERSION,
  JOBS_PROTOCOL_VERSION,
} from "@relkit/contracts/jobs";
import { sortDiagnostics, type Diagnostic } from "@relkit/diagnostics";
import { hashGraph } from "@relkit/graph";
import { publicFingerprint } from "./build-id.js";
import {
  compatibilityHashes,
  recipeReferences,
  stripScheduleInput,
  uniqueGenerations,
} from "./manifest-entries.js";
import type {
  GeneratedJobsManifest,
  JobsManifest,
  JobsManifestInput,
  JobsManifestJob,
  JobsManifestTask,
} from "./manifest.js";
import type { NormalizedDescriptor, NormalizationWork } from "../normalize-types.js";
import { isRecord } from "../normalize-utils.js";

export function buildManifest(
  input: JobsManifestInput,
  work: NormalizationWork,
  tasks: readonly JobsManifestTask[],
  jobs: readonly JobsManifestJob[],
): JobsManifest {
  const nameToId = Object.fromEntries(
    jobs
      .map((job) => [job.name, job.id])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
  );
  const serviceGenerations = uniqueGenerations(jobs);
  const workerEntries = jobs.map((job) => ({
    jobId: job.id,
    taskId: job.taskId,
    buildId: job.buildId,
    serviceGeneration: job.serviceGeneration,
    path: `.relkit/build/jobs/${job.buildId}/${job.serviceGeneration}/worker.js`,
  }));
  const schemaHashes = Object.fromEntries(
    [...work.schemaHashes.entries()].sort((left, right) => left[0].localeCompare(right[0])),
  );
  const policies = Object.fromEntries(
    tasks
      .map((task) => [task.id, task.policy])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
  );
  const schedules = jobs.flatMap((job) =>
    Array.isArray(job.schedules)
      ? job.schedules.map((schedule) => stripScheduleInput(schedule))
      : [],
  );
  return {
    protocol: JOBS_MANIFEST_PROTOCOL,
    version: JOBS_MANIFEST_VERSION,
    app: input.appId ?? work.descriptors.find((entry) => entry.kind === "app")?.id ?? "default",
    environment: input.environment ?? work.input.mode ?? "development",
    graphHash: input.graphHash,
    publicFingerprint: publicFingerprint(
      work.descriptors.filter((entry) => entry.kind === "job" && isTaskJob(entry)),
      work,
    ),
    jobsProtocolVersion: JOBS_PROTOCOL_VERSION,
    tasks,
    jobs,
    nameToId,
    serviceGenerations,
    workerEntries,
    schemaHashes,
    policies,
    schedules,
    recipes: recipeReferences(work),
    compatibilityReportHashes: compatibilityHashes(work),
  };
}

export function inputWork(input: JobsManifestInput): NormalizationWork {
  if (input.work !== undefined) return input.work;
  const referencesByKind = new Map<string, Map<string, NormalizedDescriptor>>();
  for (const descriptor of input.descriptors) {
    const values = referencesByKind.get(descriptor.kind) ?? new Map<string, NormalizedDescriptor>();
    values.set(descriptor.id, descriptor);
    referencesByKind.set(descriptor.kind, values);
  }
  return {
    input: { mode: input.environment as "development" | "test" | "production" | undefined },
    descriptors: [...input.descriptors],
    referencesByKind,
    schemaHashes: new Map(),
  } as unknown as NormalizationWork;
}

export function isTaskJob(value: NormalizedDescriptor): boolean {
  return isRecord(value.value) && isRecord(value.value.task);
}

export function result(
  source: string,
  value: JobsManifest | undefined,
  diagnostics: readonly Diagnostic[],
  activatable: boolean,
): GeneratedJobsManifest {
  return Object.freeze({
    source,
    ...(value === undefined ? {} : { value }),
    diagnostics: Object.freeze(sortDiagnostics(diagnostics)),
    activatable,
  });
}

export function emptyManifest(): GeneratedJobsManifest {
  return result("", undefined, [], false);
}

export function compareDescriptor(left: NormalizedDescriptor, right: NormalizedDescriptor): number {
  return (
    left.id.localeCompare(right.id) ||
    left.source.file.localeCompare(right.source.file) ||
    left.source.line - right.source.line ||
    left.source.column - right.source.column
  );
}
