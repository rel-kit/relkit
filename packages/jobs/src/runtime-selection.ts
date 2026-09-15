import type { JobRefAny, TaskRefAny } from "@relkit/contracts/jobs";
import type { JobsManifestLike, JobsRuntimeBinding, JobsRuntimeOptions } from "./runtime.js";
import type { JobDescriptorAny } from "./job-types.js";

export function resolveBinding(
  task: TaskRefAny,
  selector: JobRefAny | undefined,
  options: JobsRuntimeOptions,
): JobsRuntimeBinding {
  const taskId = task.ref.id;
  const selected = selector === undefined ? undefined : jobFromSelector(selector);
  const manifestJobs = options.manifest?.jobs?.filter((job) => job.taskId === taskId) ?? [];
  if (selected !== undefined && selected.taskId !== "" && selected.taskId !== taskId) {
    throw new TypeError(`Job selector "${selected.jobId}" targets task "${selected.taskId}"`);
  }
  const configuredJobs = (options.jobs ?? []).filter((job) => job.task.ref.id === taskId);
  const candidates = manifestJobs.length > 0 ? manifestJobs : configuredJobs;
  const selectedJob = selected === undefined ? undefined : candidates.find((job) => job.id === selected.jobId);
  if (
    selected !== undefined &&
    selectedJob === undefined &&
    (candidates.length > 0 || options.manifest !== undefined || options.jobs !== undefined)
  ) {
    throw new TypeError(`Job selector "${selected.jobId}" is not present in the compiled jobs manifest`);
  }
  const chosen = selectedJob ?? (selected === undefined
    ? candidates.find((job) => job.default === true) ?? (candidates.length === 1 ? candidates[0] : undefined)
    : undefined);
  const configuredJob = selected === undefined
    ? configuredJobs.find((job) => job.id === chosen?.id) ?? (configuredJobs.length === 1 ? configuredJobs[0] : undefined)
    : configuredJobs.find((job) => job.id === selected.jobId);
  if (selected === undefined && candidates.length > 1 && chosen === undefined) {
    throw new TypeError(`Task "${taskId}" has multiple jobs and no default binding`);
  }
  const jobId = selected?.jobId ?? chosen?.id ?? configuredJob?.id ?? taskId;
  const taskVersion = firstText(selected?.taskVersion, candidateText(chosen, "taskVersion"), configuredJob?.task.version, taskVersionOf(task));
  const profile = firstText(selected?.profile, candidateText(chosen, "profile"), configuredJob?.profile, "default");
  const service = firstText(selected?.service, configuredJob?.service, options.service, profile);
  const serviceGeneration = firstText(selected?.serviceGeneration, candidateText(chosen, "serviceGeneration"), options.serviceGeneration, "current");
  const buildId = firstText(selected?.buildId, candidateText(chosen, "buildId"), taskBuildId(taskId, options.manifest), taskVersion);
  const inputSchemaHash = taskSchemaHash(taskId, options.manifest);
  const taskPolicyValue = taskPolicy(taskId, options.manifest) ?? taskPolicyFromJob(configuredJob);
  const jobPolicy = candidateValue(chosen, "policy") ?? candidateValue(configuredJob, "policy");
  return Object.freeze({
    taskId,
    taskVersion,
    jobId,
    name: selected?.name ?? chosen?.name ?? configuredJob?.name ?? taskId,
    profile,
    service,
    serviceGeneration,
    buildId,
    ...(inputSchemaHash === undefined ? {} : { inputSchemaHash }),
    ...(options.scope === undefined ? {} : { scope: options.scope }),
    ...((taskPolicyValue === undefined && jobPolicy === undefined)
      ? {}
      : { policy: mergePolicies(taskPolicyValue, jobPolicy) }),
  });
}

function jobFromSelector(value: JobRefAny): JobsRuntimeBinding {
  const candidate = value as JobRefAny & Record<string, unknown>;
  const task = candidate.task as Record<string, unknown> | undefined;
  return {
    taskId: typeof task?.ref === "object" && task.ref !== null && "id" in task.ref
      ? String((task.ref as { readonly id: string }).id)
      : "",
    taskVersion: typeof task?.version === "string" ? task.version : "",
    jobId: candidate.ref.id,
    name: typeof candidate.name === "string" ? candidate.name : candidate.ref.id,
    profile: typeof candidate.profile === "string" ? candidate.profile : "default",
    service: typeof candidate.service === "string"
      ? candidate.service
      : typeof candidate.profile === "string" ? candidate.profile : "",
    serviceGeneration: typeof candidate.serviceGeneration === "string" ? candidate.serviceGeneration : "",
    buildId: typeof candidate.buildId === "string" ? candidate.buildId : "",
  };
}

function firstText(...values: readonly (string | undefined)[]): string {
  return values.find((value) => value !== undefined && value.length > 0) ?? "unknown";
}

function candidateText(value: unknown, key: string): string | undefined {
  const candidate = candidateValue(value, key);
  return typeof candidate === "string" ? candidate : undefined;
}

function candidateValue(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[key];
}

function taskVersionOf(task: TaskRefAny): string {
  const version = (task as TaskRefAny & { readonly version?: unknown }).version;
  return typeof version === "string" ? version : "unknown";
}

function taskBuildId(taskId: string, manifest: JobsManifestLike | undefined): string | undefined {
  return manifest?.tasks?.find((task) => task.id === taskId)?.buildId;
}

function taskPolicy(taskId: string, manifest: JobsManifestLike | undefined): unknown {
  return manifest?.tasks?.find((task) => task.id === taskId)?.policy;
}

function taskPolicyFromJob(job: JobDescriptorAny | undefined): unknown {
  const task = job?.task as (TaskRefAny & Record<string, unknown>) | undefined;
  if (task === undefined) return undefined;
  return {
    ...(task.retry === undefined ? {} : { retry: task.retry }),
    ...(task.maxDuration === undefined ? {} : { maxDuration: task.maxDuration }),
    ...(task.maxElapsed === undefined ? {} : { maxElapsed: task.maxElapsed }),
    ...(task.logging === undefined ? {} : { logging: task.logging }),
  };
}

function mergePolicies(taskPolicyValue: unknown, jobPolicy: unknown): unknown {
  if (!isRecord(taskPolicyValue)) return jobPolicy;
  if (!isRecord(jobPolicy)) return taskPolicyValue;
  const retry = isRecord(taskPolicyValue.retry) && isRecord(jobPolicy.retry)
    ? { ...taskPolicyValue.retry, ...jobPolicy.retry }
    : jobPolicy.retry ?? taskPolicyValue.retry;
  return { ...taskPolicyValue, ...jobPolicy, ...(retry === undefined ? {} : { retry }) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function taskSchemaHash(taskId: string, manifest: JobsManifestLike | undefined): string | undefined {
  const hashes = manifest?.tasks?.find((task) => task.id === taskId)?.schemaHashes;
  if (hashes === null || typeof hashes !== "object" || Array.isArray(hashes)) return undefined;
  const value = (hashes as Record<string, unknown>)["input:input"];
  return typeof value === "string" ? value : undefined;
}
