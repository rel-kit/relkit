import { canonicalJson, type JsonValue } from "@relkit/contracts";
import { JOBS_MANIFEST_PROTOCOL, JOBS_MANIFEST_VERSION, JOBS_PROTOCOL_VERSION } from "@relkit/contracts/jobs";
import { createDiagnostic, sortDiagnostics, type Diagnostic } from "@relkit/diagnostics";
import { hashGraph } from "@relkit/graph";
import { publicFingerprint } from "./build-id.js";
import { compatibilityHashes, jobEntry, recipeReferences, stripScheduleInput, taskEntry, uniqueGenerations } from "./manifest-entries.js";
import type { NormalizedDescriptor, NormalizedGraph, NormalizationWork } from "../normalize-types.js";
import { isRecord } from "../normalize-utils.js";

export interface JobsManifestTask {
  readonly id: string;
  readonly graphId: string;
  readonly version: string;
  readonly execution: string;
  readonly buildId: string;
  readonly schemaHashes: JsonValue;
  readonly policy: JsonValue;
  readonly dependencies: JsonValue;
  readonly publishes: JsonValue;
  readonly resources: JsonValue;
}

export interface JobsManifestJob {
  readonly id: string;
  readonly graphId: string;
  readonly name: string;
  readonly taskId: string;
  readonly taskVersion: string;
  readonly buildId: string;
  readonly profile: string;
  readonly serviceGeneration: string;
  readonly implicit: boolean;
  readonly default: boolean;
  readonly client: JsonValue;
  readonly policy: JsonValue;
  readonly schedules: JsonValue;
  readonly compatibility: JsonValue;
}

export interface JobsManifestWorkerEntry {
  readonly jobId: string;
  readonly taskId: string;
  readonly buildId: string;
  readonly serviceGeneration: string;
  readonly path: string;
}

export interface JobsManifest {
  readonly protocol: typeof JOBS_MANIFEST_PROTOCOL;
  readonly version: typeof JOBS_MANIFEST_VERSION;
  readonly app: string;
  readonly environment: string;
  readonly graphHash: string;
  readonly publicFingerprint: string;
  readonly jobsProtocolVersion: typeof JOBS_PROTOCOL_VERSION;
  readonly tasks: readonly JobsManifestTask[];
  readonly jobs: readonly JobsManifestJob[];
  readonly nameToId: Readonly<Record<string, string>>;
  readonly serviceGenerations: readonly { readonly profile: string; readonly generation: string }[];
  readonly workerEntries: readonly JobsManifestWorkerEntry[];
  readonly schemaHashes: Readonly<Record<string, string>>;
  readonly policies: Readonly<Record<string, JsonValue>>;
  readonly schedules: readonly JsonValue[];
  readonly recipes: readonly JsonValue[];
  readonly compatibilityReportHashes: readonly string[];
}

export interface JobsManifestInput {
  readonly graph?: NormalizedGraph;
  readonly graphHash: string;
  readonly descriptors: readonly NormalizedDescriptor[];
  readonly diagnostics?: readonly Diagnostic[];
  readonly appId?: string;
  readonly environment?: string;
  readonly projectRoot?: string;
  readonly work?: NormalizationWork;
}

export interface GeneratedJobsManifest {
  readonly source: string;
  readonly value?: JobsManifest;
  readonly diagnostics: readonly Diagnostic[];
  readonly activatable: boolean;
}

export const JOBS_MANIFEST_CODES = Object.freeze({
  mismatch: "RELKIT_JOBS_MANIFEST_GRAPH_MISMATCH",
} as const);

/** Builds the data-only v1 jobs manifest with stable ordering and no callbacks or payloads. */
export function generateJobsManifest(input: JobsManifestInput): GeneratedJobsManifest {
  const existing = input.diagnostics ?? [];
  if (existing.some((diagnostic) => diagnostic.severity === "error")) return emptyManifest();
  const diagnostics: Diagnostic[] = [];
  if (input.graph !== undefined && hashGraph(input.graph) !== input.graphHash) {
    diagnostics.push(createDiagnostic({
      code: JOBS_MANIFEST_CODES.mismatch,
      severity: "error",
      message: "Jobs manifest graph hash does not match the canonical graph.",
    }));
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) return result("", undefined, diagnostics, false);
  const work = inputWork(input);
  const tasks = input.descriptors.filter((entry) => entry.kind === "task").sort(compareDescriptor);
  const jobs = input.descriptors.filter((entry) => entry.kind === "job" && isTaskJob(entry)).sort(compareDescriptor);
  const taskEntries = tasks.map((task) => taskEntry(task, work));
  const jobEntries = jobs.map((job) => jobEntry(job, work));
  const manifest = buildManifest(input, work, taskEntries, jobEntries);
  return result(`${canonicalJson(manifest)}\n`, manifest, diagnostics, true);
}

function buildManifest(
  input: JobsManifestInput,
  work: NormalizationWork,
  tasks: readonly JobsManifestTask[],
  jobs: readonly JobsManifestJob[],
): JobsManifest {
  const nameToId = Object.fromEntries(
    jobs.map((job) => [job.name, job.id]).sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
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
    tasks.map((task) => [task.id, task.policy]).sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
  );
  const schedules = jobs.flatMap((job) => Array.isArray(job.schedules) ? job.schedules.map((schedule) => stripScheduleInput(schedule)) : []);
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

function inputWork(input: JobsManifestInput): NormalizationWork {
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

function isTaskJob(value: NormalizedDescriptor): boolean {
  return isRecord(value.value) && isRecord(value.value.task);
}

function result(source: string, value: JobsManifest | undefined, diagnostics: readonly Diagnostic[], activatable: boolean): GeneratedJobsManifest {
  return Object.freeze({ source, ...(value === undefined ? {} : { value }), diagnostics: Object.freeze(sortDiagnostics(diagnostics)), activatable });
}

function emptyManifest(): GeneratedJobsManifest {
  return result("", undefined, [], false);
}

function compareDescriptor(left: NormalizedDescriptor, right: NormalizedDescriptor): number {
  return left.id.localeCompare(right.id) || left.source.file.localeCompare(right.source.file) || left.source.line - right.source.line || left.source.column - right.source.column;
}
