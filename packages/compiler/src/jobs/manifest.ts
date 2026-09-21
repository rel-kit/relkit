import { canonicalJson, type JsonValue } from "@relkit/contracts";
import {
  JOBS_MANIFEST_PROTOCOL,
  JOBS_MANIFEST_VERSION,
  JOBS_PROTOCOL_VERSION,
} from "@relkit/contracts/jobs";
import { createDiagnostic, type Diagnostic } from "@relkit/diagnostics";
import { jobEntry, taskEntry } from "./manifest-entries.js";
import type {
  NormalizedDescriptor,
  NormalizedGraph,
  NormalizationWork,
} from "../normalize-types.js";
import { hashGraph } from "../normalize-graph.js";
import {
  buildManifest,
  compareDescriptor,
  emptyManifest,
  inputWork,
  isTaskJob,
  result,
} from "./manifest-build.js";

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
    diagnostics.push(
      createDiagnostic({
        code: JOBS_MANIFEST_CODES.mismatch,
        severity: "error",
        message: "Jobs manifest graph hash does not match the canonical graph.",
      }),
    );
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error"))
    return result("", undefined, diagnostics, false);
  const work = inputWork(input);
  const tasks = input.descriptors.filter((entry) => entry.kind === "task").sort(compareDescriptor);
  const jobs = input.descriptors
    .filter((entry) => entry.kind === "job" && isTaskJob(entry))
    .sort(compareDescriptor);
  const taskEntries = tasks.map((task) => taskEntry(task, work));
  const jobEntries = jobs.map((job) => jobEntry(job, work));
  const manifest = buildManifest(input, work, taskEntries, jobEntries);
  return result(`${canonicalJson(manifest)}\n`, manifest, diagnostics, true);
}
