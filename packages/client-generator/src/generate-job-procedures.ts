import type { ApplicationGraph, TaskJobNode } from "@relkit/graph";
import { jobProcedureEntrySources } from "./generate-job-types.js";

export const JOB_PROCEDURE_OPERATIONS = [
  "trigger",
  "get",
  "list",
  "watch",
  "cancel",
  "retry",
  "stream",
] as const;

export type JobProcedureOperation = (typeof JOB_PROCEDURE_OPERATIONS)[number];

export interface JobProcedureSource {
  readonly name: string;
  readonly jobId: string;
  readonly taskId: string;
  readonly taskVersion: string;
  readonly buildId?: string;
  readonly input: unknown;
  readonly output: unknown;
  readonly errors?: unknown;
  readonly progress?: unknown;
  readonly streams?: unknown;
  readonly operations: readonly JobProcedureOperation[];
  readonly fields: readonly string[];
  readonly streamNames: readonly string[];
}

export interface JobProcedureDocument extends JobProcedureSource {
  readonly procedurePaths?: Readonly<Record<JobProcedureOperation, readonly string[]>>;
}

export function jobProcedureSources(graph: ApplicationGraph): readonly JobProcedureSource[] {
  return graph.nodes
    .filter(isExposedJob)
    .map((job) => source(job))
    .sort(
      (left, right) => left.name.localeCompare(right.name) || left.jobId.localeCompare(right.jobId),
    );
}

export function jobProcedureSourcesFromDocument(value: unknown): readonly JobProcedureSource[] {
  return (Array.isArray(value) ? value : [])
    .filter(isRecord)
    .flatMap((job) => {
      if (
        typeof job.name !== "string" ||
        typeof job.jobId !== "string" ||
        typeof job.taskId !== "string" ||
        typeof job.taskVersion !== "string"
      )
        return [];
      const operations = supportedOperations(job.operations);
      if (operations.length === 0) return [];
      return [
        {
          name: job.name,
          jobId: job.jobId,
          taskId: job.taskId,
          taskVersion: job.taskVersion,
          ...(typeof job.buildId === "string" ? { buildId: job.buildId } : {}),
          input: job.input,
          output: job.output,
          ...(job.errors === undefined ? {} : { errors: job.errors }),
          ...(job.progress === undefined ? {} : { progress: job.progress }),
          ...(job.streams === undefined ? {} : { streams: job.streams }),
          operations,
          fields: stringArray(job.fields),
          streamNames: stringArray(job.streamNames ?? recordKeys(job.streams)),
        },
      ];
    })
    .sort(
      (left, right) => left.name.localeCompare(right.name) || left.jobId.localeCompare(right.jobId),
    );
}

export function jobProcedureEntries(graph: ApplicationGraph): readonly string[] {
  return jobProcedureEntrySources(jobProcedureSources(graph));
}

export function jobProcedureEntriesFromSources(
  sources: readonly JobProcedureSource[],
): readonly string[] {
  return jobProcedureEntrySources(sources);
}

export function jobProcedureEntriesFromDocument(value: unknown): readonly string[] {
  return jobProcedureEntrySources(jobProcedureSourcesFromDocument(value));
}

export function jobProcedurePaths(
  source: Pick<JobProcedureSource, "name" | "operations">,
): Readonly<Record<JobProcedureOperation, readonly string[]>> {
  return Object.fromEntries(
    source.operations.map((operation) => [
      operation,
      operation === "trigger"
        ? ["jobs", source.name, "trigger"]
        : ["jobs", source.name, "runs", operation],
    ]),
  ) as unknown as Readonly<Record<JobProcedureOperation, readonly string[]>>;
}

export function jobProcedureDocument(source: JobProcedureSource): JobProcedureDocument {
  return Object.freeze({ ...source, procedurePaths: jobProcedurePaths(source) });
}

function source(job: TaskJobNode): JobProcedureSource {
  const client = isRecord(job.client) ? job.client : {};
  return {
    name: job.name,
    jobId: job.jobId,
    taskId: job.taskId,
    taskVersion: job.taskVersion,
    ...(job.buildId === undefined ? {} : { buildId: job.buildId }),
    input: job.input,
    output: job.output,
    ...(job.errors === undefined ? {} : { errors: job.errors }),
    ...(job.progress === undefined ? {} : { progress: job.progress }),
    ...(job.streams === undefined ? {} : { streams: job.streams }),
    operations: supportedOperations(client.operations),
    fields: stringArray(client.fields),
    streamNames: stringArray(client.streams),
  };
}

function isExposedJob(node: ApplicationGraph["nodes"][number]): node is TaskJobNode {
  if (node.kind !== "job" || node.executionModel !== "task" || node.implicit) return false;
  if (!isRecord(node.client)) return false;
  return supportedOperations(node.client.operations).length > 0;
}

function supportedOperations(value: unknown): JobProcedureOperation[] {
  return JOB_PROCEDURE_OPERATIONS.filter(
    (operation) => Array.isArray(value) && value.includes(operation),
  );
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function recordKeys(value: unknown): string[] {
  return isRecord(value) ? Object.keys(value) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export {
  jobFailureType,
  jobFieldsType,
  jobSnapshotType,
  jobStreamItemType,
} from "./generate-job-types.js";
