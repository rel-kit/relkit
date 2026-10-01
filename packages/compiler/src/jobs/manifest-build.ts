import { observeJobs } from "./observability.js";
import { JobsManifest as JobsManifestSchema } from "./manifest-schema.js";
import { Effect } from "effect";
import { runJobsSync } from "./compatibility.js";
import {
  JOBS_MANIFEST_PROTOCOL,
  JOBS_MANIFEST_VERSION,
  JOBS_PROTOCOL_VERSION,
} from "@relkit/contracts/jobs";
import { sortDiagnostics, type Diagnostic } from "@relkit/diagnostics";

import { publicFingerprintEffect } from "./build-id.js";
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
import { EMPTY_OUTPUTS } from "../normalize-types.js";
import type { NormalizedDescriptor, NormalizationWork } from "../normalize-types.js";
import { isRecord } from "../normalize-utils.js";

/**
 * Assembles task, job, routing, policy, and provider metadata.
 * @param input - Trusted normalized inputs and optional authoritative workspace.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @param tasks - Task manifest entries included in the generated document.
 * @param jobs - Job descriptors or manifest entries to project in stable order.
 * @returns A lazy effect yielding the schema-validated version-one jobs manifest.
 * @remarks Manifest construction failures use SchemaIssue validation issues; JSON failures use JsonValueError.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { buildManifestEffect, inputWork } from "./manifest-build.js";
 * const input = { graphHash: "example", descriptors: [] };
 * const exit = Effect.runSync(Effect.exit(buildManifestEffect(input, inputWork(input), [], [])));
 * ```
 */
export const buildManifestEffect = Effect.fn("Jobs.buildManifest")(
  function* (
    input: JobsManifestInput,
    work: NormalizationWork,
    tasks: readonly JobsManifestTask[],
    jobs: readonly JobsManifestJob[],
  ) {
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
    return yield* JobsManifestSchema.makeEffect({
      protocol: JOBS_MANIFEST_PROTOCOL,
      version: JOBS_MANIFEST_VERSION,
      app: input.appId ?? work.descriptors.find((entry) => entry.kind === "app")?.id ?? "default",
      environment: input.environment ?? work.input.mode ?? "development",
      graphHash: input.graphHash,
      publicFingerprint: yield* publicFingerprintEffect(
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
    });
  },
  (effect, input, work, tasks, jobs) =>
    observeJobs("buildManifest", effect, () => ({ tasks: tasks.length, jobs: jobs.length })),
);

/**
 * Assembles task, job, routing, policy, and provider metadata.
 * @param input - Trusted normalized inputs and optional authoritative workspace.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @param tasks - Task manifest entries included in the generated document.
 * @param jobs - Job descriptors or manifest entries to project in stable order.
 * @returns the schema-validated version-one jobs manifest.
 * @see {@link buildManifestEffect} for composition and execution examples.
 */
export function buildManifest(
  input: JobsManifestInput,
  work: NormalizationWork,
  tasks: readonly JobsManifestTask[],
  jobs: readonly JobsManifestJob[],
): JobsManifest {
  return runJobsSync(buildManifestEffect(input, work, tasks, jobs));
}

/**
 * Reuses normalization work or initializes complete isolated manifest indexes.
 * @param input - Trusted normalized inputs and optional authoritative workspace.
 * @returns the supplied workspace or a fresh complete workspace.
 */
export function inputWork(input: JobsManifestInput): NormalizationWork {
  if (input.work !== undefined) return input.work;
  const referencesByKind = new Map<string, Map<string, NormalizedDescriptor>>();
  for (const descriptor of input.descriptors) {
    const values = referencesByKind.get(descriptor.kind) ?? new Map<string, NormalizedDescriptor>();
    values.set(descriptor.id, descriptor);
    referencesByKind.set(descriptor.kind, values);
  }
  return {
    input: {
      ...(input.environment === "development" ||
      input.environment === "test" ||
      input.environment === "production"
        ? { mode: input.environment }
        : {}),
    },
    descriptors: [...input.descriptors],
    referencesByKind,
    schemaHashes: new Map(),
    references: new Map(),
    middlewareReferences: new Map(),
    transformReferences: new Map(),
    schemas: new Map(),
    nodes: [],
    edges: [],
    observedEdges: [],
    serviceDependencies: [],
    diagnostics: [],
    passOrder: [],
    outputs: EMPTY_OUTPUTS,
  };
}

/**
 * Checks whether a job has a task-shaped binding.
 * @param value - Value or descriptor to inspect without coercion.
 * @returns whether the descriptor carries a task object.
 */
export function isTaskJob(value: NormalizedDescriptor): boolean {
  return isRecord(value.value) && isRecord(value.value.task);
}

/**
 * Freezes a manifest result and deterministically sorts its diagnostics.
 * @param source - Canonical serialized manifest bytes.
 * @param value - Generated manifest, omitted when prerequisites prevent generation.
 * @param diagnostics - Compiler diagnostics to sort and freeze.
 * @param activatable - Whether the generated manifest can be activated.
 * @returns the immutable generated manifest result.
 */
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

/**
 * Creates the inactive result used when prerequisite diagnostics prevent generation.
 * @returns an inactive empty manifest result.
 */
export function emptyManifest(): GeneratedJobsManifest {
  return result("", undefined, [], false);
}

/**
 * Orders descriptors by identity and then source position.
 * @param left - First value or descriptor to compare.
 * @param right - Second value or descriptor to compare.
 * @returns a negative, zero, or positive comparison result.
 */
export function compareDescriptor(left: NormalizedDescriptor, right: NormalizedDescriptor): number {
  return (
    left.id.localeCompare(right.id) ||
    left.source.file.localeCompare(right.source.file) ||
    left.source.line - right.source.line ||
    left.source.column - right.source.column
  );
}
