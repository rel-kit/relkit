import { Effect } from "effect";
import { add } from "../normalize-pass-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizationWork,
  type NormalizedDescriptor,
} from "../normalize-types.js";
import { isRecord } from "../normalize-utils.js";
import { runJobsSync } from "./compatibility.js";
import { observeJobs } from "./observability.js";

const OPERATIONS = new Set(["trigger", "get", "list", "watch", "cancel", "retry", "stream"]);
const FIELDS = new Set(["status", "input", "progress", "output", "error"]);

/**
 * Checks client exposure, authorization choice, and task-backed observation fields.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @param job - Normalized job binding being projected or checked.
 * @param task - Normalized task descriptor being projected or checked.
 * @returns A lazy effect yielding void after appending all invalid exposure diagnostics.
 * @remarks Requires no services. Unexpected exceptions remain defects.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { validateClientEffect } from "./diagnostic-validation.js";
 * // work, job, and task are resolved normalization inputs; findings append to work.diagnostics.
 * Effect.runSync(validateClientEffect(work, job, task));
 * ```
 */
export const validateClientEffect = Effect.fn("Jobs.validateClient")(
  function* (work: NormalizationWork, job: NormalizedDescriptor, task: NormalizedDescriptor) {
    const value = isRecord(job.value) ? job.value : {};
    const client = value.client;
    if (client === undefined) return;
    if (!isRecord(client)) {
      add(work, job, NORMALIZE_CODES.jobExposure, "Job client exposure must be an object.");
      return;
    }
    const operations = Array.isArray(client.operations) ? client.operations : [];
    if (
      operations.length === 0 ||
      operations.some((operation) => !OPERATIONS.has(String(operation)))
    )
      add(
        work,
        job,
        NORMALIZE_CODES.jobExposure,
        "Job client operations must be non-empty and supported.",
      );
    const fields = Array.isArray(client.fields) ? client.fields : [];
    if (fields.some((field) => !FIELDS.has(String(field))))
      add(
        work,
        job,
        NORMALIZE_CODES.jobExposure,
        "Job client fields contain an unsupported field.",
      );
    const publicAccess = client.public === true;
    const authorizedAccess = isExecutableMarker(client.authorize);
    if (publicAccess === authorizedAccess)
      add(
        work,
        job,
        NORMALIZE_CODES.jobExposure,
        "Job client exposure must choose public or authorize.",
      );
    if (publicAccess && value.private === true)
      add(work, job, NORMALIZE_CODES.jobExposure, "Private jobs cannot be publicly exposed.");
    const taskValue = isRecord(task.value) ? task.value : {};
    if (fields.includes("progress") && taskValue.progress === undefined)
      add(
        work,
        job,
        NORMALIZE_CODES.jobExposure,
        "Client progress exposure requires a task progress schema.",
      );
    if (operations.includes("stream")) {
      if (!isRecord(taskValue.streams))
        add(
          work,
          job,
          NORMALIZE_CODES.jobExposure,
          "Client stream access requires declared task streams.",
        );
      if (
        !Array.isArray(client.streams) ||
        client.streams.some(
          (name) => !isRecord(taskValue.streams) || !Object.hasOwn(taskValue.streams, name),
        )
      )
        add(
          work,
          job,
          NORMALIZE_CODES.jobExposure,
          "Client streams must name declared task streams.",
        );
    }
  },
  (effect) => observeJobs("validateClient", effect, () => ({ jobs: 1, tasks: 1 })),
);

/**
 * Checks client exposure, authorization choice, and task-backed observation fields.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @param job - Normalized job binding being projected or checked.
 * @param task - Normalized task descriptor being projected or checked.
 * @returns void after appending all invalid exposure diagnostics.
 * @see {@link validateClientEffect} for composition and execution examples.
 */
export function validateClient(
  work: NormalizationWork,
  job: NormalizedDescriptor,
  task: NormalizedDescriptor,
): void {
  return runJobsSync(validateClientEffect(work, job, task));
}

/**
 * Checks positive finite CPU and memory metadata.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @param task - Normalized task descriptor being projected or checked.
 * @returns A lazy effect yielding void after appending invalid resource diagnostics.
 * @remarks Requires no services. Validation findings append diagnostics; unexpected exceptions remain defects.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { validateResourcesEffect } from "./diagnostic-validation.js";
 * // task is resolved; work owns the resulting resource diagnostics.
 * Effect.runSync(validateResourcesEffect(work, task));
 * ```
 */
export const validateResourcesEffect = Effect.fn("Jobs.validateResources")(
  function* (work: NormalizationWork, task: NormalizedDescriptor) {
    const value = isRecord(task.value) ? task.value : {};
    if (value.resources === undefined) return;
    if (
      !isRecord(value.resources) ||
      typeof value.resources.cpu !== "number" ||
      !Number.isFinite(value.resources.cpu) ||
      value.resources.cpu <= 0 ||
      !memoryLike(value.resources.memory)
    )
      add(
        work,
        task,
        NORMALIZE_CODES.jobResources,
        "Task resources must declare positive CPU and memory values.",
      );
  },
  (effect) => observeJobs("validateResources", effect, () => ({ tasks: 1 })),
);

/**
 * Checks positive finite CPU and memory metadata.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @param task - Normalized task descriptor being projected or checked.
 * @returns void after appending invalid resource diagnostics.
 * @see {@link validateResourcesEffect} for composition and execution examples.
 */
export function validateResources(work: NormalizationWork, task: NormalizedDescriptor): void {
  return runJobsSync(validateResourcesEffect(work, task));
}

/**
 * Checks memory quantity syntax in MiB or GiB.
 * @param value - Value or descriptor to inspect without coercion.
 * @returns whether the value matches the accepted memory syntax.
 */
function memoryLike(value: unknown): boolean {
  return typeof value === "string" && /^\d+(?:\.\d+)? (?:MiB|GiB)$/u.test(value);
}

/**
 * Recognizes a live callback or its evaluator function marker.
 * @param value - Value or descriptor to inspect without coercion.
 * @returns whether the value represents executable authorization.
 */
function isExecutableMarker(value: unknown): boolean {
  return typeof value === "function" || (isRecord(value) && value.$relkit === "function");
}

export { validateSchedules, validateSchedulesEffect } from "./schedule-validation.js";
