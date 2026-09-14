import { add } from "../normalize-pass-utils.js";
import { schema, schemaEquivalent } from "../normalize-compat.js";
import { NORMALIZE_CODES, type NormalizedDescriptor, type NormalizationWork } from "../normalize-types.js";
import { isRecord, json, refId } from "../normalize-utils.js";
import { validateProviderRequirements, taskForJob } from "./provider-requirements.js";
import { validateReplayAdvisories } from "./replay-diagnostics.js";
import { computeJobBuildId } from "./build-id.js";

const OPERATIONS = new Set(["trigger", "get", "list", "watch", "cancel", "retry", "stream"]);
const FIELDS = new Set(["status", "input", "progress", "output", "error"]);

/** Runs task-backed preflight checks after names and references are available. */
export function validateJobRequirements(work: NormalizationWork): void {
  for (const job of work.descriptors.filter((entry) => entry.kind === "job")) {
    const value = isRecord(job.value) ? job.value : {};
    if (!isRecord(value.task)) continue;
    const task = taskForJob(work, job);
    if (task === undefined) continue;
    validateVersion(work, job, task);
    validateJobSchemas(work, job, task);
    validateClient(work, job, task);
    validateSchedules(work, job);
    validateResources(work, task);
    validateProviderRequirements(work, job, task);
  }
  validateReplayAdvisories(work);
}

function validateVersion(
  work: NormalizationWork,
  job: NormalizedDescriptor,
  task: NormalizedDescriptor,
): void {
  const jobValue = isRecord(job.value) ? job.value : {};
  const taskValue = isRecord(task.value) ? task.value : {};
  const taskVersion = typeof taskValue.version === "string" ? taskValue.version : undefined;
  const boundTask = isRecord(jobValue.task) ? jobValue.task : {};
  if (taskVersion === undefined || taskVersion.length === 0) {
    add(work, task, NORMALIZE_CODES.jobVersion, "Task version must be a non-empty string.");
  } else if (boundTask.version !== undefined && boundTask.version !== taskVersion) {
    add(
      work,
      job,
      NORMALIZE_CODES.jobVersion,
      `Job "${job.id}" binds task "${task.id}" at version "${String(boundTask.version)}", but the task declares "${taskVersion}".`,
    );
  }
  if (typeof jobValue.buildId === "string" && jobValue.buildId.trim() === "")
    add(work, job, NORMALIZE_CODES.jobVersion, "Job buildId must not be empty.");
  const computedBuildId = computeJobBuildId(job, work);
  if (
    typeof jobValue.buildId === "string" &&
    computedBuildId !== undefined &&
    jobValue.buildId !== computedBuildId
  ) {
    add(
      work,
      job,
      NORMALIZE_CODES.jobVersion,
      `Job "${job.id}" pins buildId "${jobValue.buildId}" but the current task contract resolves to "${computedBuildId}".`,
      "error",
      undefined,
      "Regenerate the jobs manifest or retain the pinned worker build for accepted runs.",
    );
  }
}

function validateJobSchemas(
  work: NormalizationWork,
  job: NormalizedDescriptor,
  task: NormalizedDescriptor,
): void {
  const jobValue = isRecord(job.value) ? job.value : {};
  const taskValue = isRecord(task.value) ? task.value : {};
  if (jobValue.input !== undefined && !schemaEquivalent(jobValue.input, taskValue.input))
    add(work, job, NORMALIZE_CODES.jobProjection, "Job input must be the task input view and cannot be overridden.");
  if (jobValue.output !== undefined && !schemaEquivalent(jobValue.output, taskValue.output))
    add(work, job, NORMALIZE_CODES.jobProjection, "Job output must be the task output view and cannot be overridden.");
  const canonicalInput = schema(taskValue.inputWire ?? taskValue.input, "output");
  if (!canonicalInput.ok)
    add(work, task, NORMALIZE_CODES.jobProjection, "Task has no faithful canonical input projection.");
}

function validateClient(
  work: NormalizationWork,
  job: NormalizedDescriptor,
  task: NormalizedDescriptor,
): void {
  const value = isRecord(job.value) ? job.value : {};
  const client = value.client;
  if (client === undefined) return;
  if (!isRecord(client)) {
    add(work, job, NORMALIZE_CODES.jobExposure, "Job client exposure must be an object.");
    return;
  }
  const operations = Array.isArray(client.operations) ? client.operations : [];
  if (operations.length === 0 || operations.some((operation) => !OPERATIONS.has(String(operation))))
    add(work, job, NORMALIZE_CODES.jobExposure, "Job client operations must be non-empty and supported.");
  const fields = Array.isArray(client.fields) ? client.fields : [];
  if (fields.some((field) => !FIELDS.has(String(field))))
    add(work, job, NORMALIZE_CODES.jobExposure, "Job client fields contain an unsupported field.");
  const publicAccess = client.public === true;
  const authorizedAccess = isExecutableMarker(client.authorize);
  if (publicAccess === authorizedAccess)
    add(work, job, NORMALIZE_CODES.jobExposure, "Job client exposure must choose public or authorize.");
  if (publicAccess && value.private === true)
    add(work, job, NORMALIZE_CODES.jobExposure, "Private jobs cannot be publicly exposed.");
  const taskValue = isRecord(task.value) ? task.value : {};
  if (fields.includes("progress") && taskValue.progress === undefined)
    add(work, job, NORMALIZE_CODES.jobExposure, "Client progress exposure requires a task progress schema.");
  if (operations.includes("stream")) {
    if (!isRecord(taskValue.streams))
      add(work, job, NORMALIZE_CODES.jobExposure, "Client stream access requires declared task streams.");
    if (!Array.isArray(client.streams) || client.streams.some((name) => !isRecord(taskValue.streams) || !Object.hasOwn(taskValue.streams, name)))
      add(work, job, NORMALIZE_CODES.jobExposure, "Client streams must name declared task streams.");
  }
}

function validateSchedules(work: NormalizationWork, job: NormalizedDescriptor): void {
  const value = isRecord(job.value) ? job.value : {};
  const schedules = value.schedules ?? value.schedule;
  if (schedules === undefined) return;
  if (!Array.isArray(schedules)) {
    add(work, job, NORMALIZE_CODES.jobSchedule, "Job schedules must be an array.");
    return;
  }
  const ids = new Set<string>();
  for (const schedule of schedules) {
    const record = isRecord(schedule) ? schedule : {};
    const id = typeof record.id === "string" ? record.id : "";
    if (id.length === 0 || ids.has(id)) add(work, job, NORMALIZE_CODES.jobSchedule, "Job schedule IDs must be unique non-empty strings.");
    ids.add(id);
    const cron = typeof record.cron === "string";
    const every = typeof record.every === "string";
    if (cron === every || (cron && !cronLike(record.cron)) || (every && !durationLike(record.every)))
      add(work, job, NORMALIZE_CODES.jobSchedule, `Schedule "${id}" must use one valid cron or every expression.`);
    if (cron && typeof record.timezone !== "string")
      add(work, job, NORMALIZE_CODES.jobSchedule, `Schedule "${id}" requires an IANA timezone.`);
    if (!Object.hasOwn(record, "input") || !json(record.input))
      add(work, job, NORMALIZE_CODES.jobSchedule, `Schedule "${id}" must contain JSON input.`);
    if (record.overlap !== undefined && record.overlap !== "allow" && record.overlap !== "skip")
      add(work, job, NORMALIZE_CODES.jobSchedule, `Schedule "${id}" has an invalid overlap policy.`);
    if (record.misfire !== undefined && !["skip", "latest", "all"].includes(String(record.misfire)))
      add(work, job, NORMALIZE_CODES.jobSchedule, `Schedule "${id}" has an invalid misfire policy.`);
  }
}

function validateResources(work: NormalizationWork, task: NormalizedDescriptor): void {
  const value = isRecord(task.value) ? task.value : {};
  if (value.resources === undefined) return;
  if (!isRecord(value.resources) || typeof value.resources.cpu !== "number" || !Number.isFinite(value.resources.cpu) || value.resources.cpu <= 0 || !memoryLike(value.resources.memory))
    add(work, task, NORMALIZE_CODES.jobResources, "Task resources must declare positive CPU and memory values.");
}

function cronLike(value: unknown): boolean {
  return typeof value === "string" && value.trim().split(/\s+/u).length === 5;
}

function durationLike(value: unknown): boolean {
  return typeof value === "string" && /^\d+(?:\.\d+)? (?:milliseconds?|seconds?|minutes?|hours?|days?|weeks?)$/u.test(value);
}

function memoryLike(value: unknown): boolean {
  return typeof value === "string" && /^\d+(?:\.\d+)? (?:MiB|GiB)$/u.test(value);
}

function isExecutableMarker(value: unknown): boolean {
  return typeof value === "function" || (isRecord(value) && value.$relkit === "function");
}

export { taskForJob };
