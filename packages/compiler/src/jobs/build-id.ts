import { observeJobs } from "./observability.js";
import { Effect } from "effect";
import { runJobsSync } from "./compatibility.js";
import { taskReferenceIdEffect } from "./reference.js";
import type { JsonValue } from "@relkit/contracts";
import { providerMaps, selectedProviderProfile } from "../normalize-graph-app.js";
import type { NormalizedDescriptor, NormalizationWork } from "../normalize-types.js";
import { isRecord } from "../normalize-utils.js";
import {
  dependencyClosureEffect,
  hashEffect,
  schemaHashes,
  selectFields,
  text,
  stableValueEffect,
} from "./build-id-values.js";

export const JOB_BUILD_PROTOCOL_VERSION = 1 as const;

/**
 * Hashes executable, dependency, schema, and adapter contracts independently of public job names.
 * @param task - Normalized task descriptor being projected or checked.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @param adapterSemantics - Optional provider execution semantics participating in compatibility identity.
 * @returns A lazy effect yielding the stable SHA-256 task build identity.
 * @remarks Requires no services. Invalid JSON fails with JsonValueError; unexpected exceptions remain defects.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { computeTaskBuildIdEffect } from "./build-id.js";
 * // task and work are normalized compiler inputs.
 * const exit = Effect.runSync(Effect.exit(computeTaskBuildIdEffect(task, work)));
 * ```
 */
export const computeTaskBuildIdEffect = Effect.fn("Jobs.computeTaskBuildId")(
  function* (task: NormalizedDescriptor, work: NormalizationWork, adapterSemantics?: JsonValue) {
    const value = isRecord(task.value) ? task.value : {};
    const identity = {
      protocolVersion: JOB_BUILD_PROTOCOL_VERSION,
      taskId: task.id,
      executable: yield* stableValueEffect(selectFields(value)),
      dependencies: yield* dependencyClosureEffect(work, value.dependencies),
      schemas: schemaHashes(work, task.id),
      adapter: adapterSemantics ?? null,
    } satisfies JsonValue;
    return yield* hashEffect(identity);
  },
  (effect, _task, work, _adapterSemantics?: JsonValue) =>
    observeJobs("taskBuildId", effect, () => ({ tasks: 1, schemaHashes: work.schemaHashes.size })),
);

/**
 * Hashes executable, dependency, schema, and adapter contracts independently of public job names.
 * @param task - Normalized task descriptor being projected or checked.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @param adapterSemantics - Optional provider execution semantics participating in compatibility identity.
 * @returns the stable SHA-256 task build identity.
 * @see {@link computeTaskBuildIdEffect} for composition and execution examples.
 */
export function computeTaskBuildId(
  task: NormalizedDescriptor,
  work: NormalizationWork,
  adapterSemantics?: JsonValue,
): string {
  return runJobsSync(computeTaskBuildIdEffect(task, work, adapterSemantics));
}

/**
 * Resolves a task-backed build identity using the selected provider generation.
 * @param job - Normalized job binding being projected or checked.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @returns A lazy effect yielding the binding build identity, or undefined when its task is unresolved.
 * @remarks Requires no services. Invalid build JSON fails with JsonValueError; unresolved task references yield undefined.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { computeJobBuildIdEffect } from "./build-id.js";
 * // job and work are normalized compiler inputs.
 * const build = computeJobBuildIdEffect(job, work).pipe(Effect.map((id) => id ?? "unresolved"));
 * const exit = Effect.runSync(Effect.exit(build));
 * ```
 */
export const computeJobBuildIdEffect = Effect.fn("Jobs.computeJobBuildId")(
  function* (job: NormalizedDescriptor, work: NormalizationWork) {
    const value = isRecord(job.value) ? job.value : {};
    const taskId = yield* taskReferenceIdEffect(value.task);
    const task = taskId === undefined ? undefined : work.referencesByKind.get("task")?.get(taskId);
    if (task === undefined) return undefined;
    const profile = selectedProviderProfile(
      work.descriptors.find((entry) => entry.kind === "app")?.value,
      "job",
      typeof value.service === "string"
        ? value.service
        : typeof value.profile === "string"
          ? value.profile
          : undefined,
    );
    return yield* computeTaskBuildIdEffect(task, work, {
      profile: profile ?? "default",
      serviceGeneration: yield* serviceGenerationForEffect(work, job, profile),
    });
  },
  (effect) => observeJobs("jobBuildId", effect, () => ({ jobs: 1 })),
);

/**
 * Resolves a task-backed build identity using the selected provider generation.
 * @param job - Normalized job binding being projected or checked.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @returns the binding build identity, or undefined when its task is unresolved.
 * @see {@link computeJobBuildIdEffect} for composition and execution examples.
 */
export function computeJobBuildId(
  job: NormalizedDescriptor,
  work: NormalizationWork,
): string | undefined {
  return runJobsSync(computeJobBuildIdEffect(job, work));
}

/**
 * Hashes the sorted public job surface and optional provider generations.
 * @param jobs - Job descriptors or manifest entries to project in stable order.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @returns A lazy effect yielding the stable SHA-256 public surface fingerprint.
 * @remarks Requires no services. Invalid projected JSON fails with JsonValueError; unexpected exceptions remain defects.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { publicFingerprintEffect } from "./build-id.js";
 * const fingerprint = Effect.runSync(publicFingerprintEffect([]));
 * ```
 */
export const publicFingerprintEffect = Effect.fn("Jobs.publicFingerprint")(
  function* (jobs: readonly NormalizedDescriptor[], work?: NormalizationWork) {
    const entries = (yield* Effect.forEach(jobs, (job) =>
      Effect.gen(function* () {
        const value = isRecord(job.value) ? job.value : {};
        return {
          id: job.id,
          name: typeof value.name === "string" ? value.name : "",
          taskId: (yield* taskReferenceIdEffect(value.task)) ?? "",
          client: yield* stableValueEffect(value.client),
          ...(work === undefined ? {} : { service: yield* serviceGenerationForEffect(work, job) }),
        };
      }),
    )).sort(
      (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
    );
    return yield* hashEffect(entries);
  },
  (effect, jobs, _work?: NormalizationWork) =>
    observeJobs("publicFingerprint", effect, () => ({ jobs: jobs.length })),
);

/**
 * Hashes the sorted public job surface and optional provider generations.
 * @param jobs - Job descriptors or manifest entries to project in stable order.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @returns the stable SHA-256 public surface fingerprint.
 * @see {@link publicFingerprintEffect} for composition and execution examples.
 */
export function publicFingerprint(
  jobs: readonly NormalizedDescriptor[],
  work?: NormalizationWork,
): string {
  return runJobsSync(publicFingerprintEffect(jobs, work));
}

/**
 * Uses an explicit generation or hashes the selected provider binding.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @param job - Normalized job binding being projected or checked.
 * @param profile - Selected provider profile; omission uses the application's selection.
 * @returns A lazy effect yielding the stable service generation identity.
 * @remarks Requires no services. Invalid provider JSON fails with JsonValueError; unexpected exceptions remain defects.
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { serviceGenerationForEffect } from "./build-id.js";
 * // work and job are normalized compiler inputs.
 * const exit = Effect.runSync(Effect.exit(serviceGenerationForEffect(work, job)));
 * ```
 */
export const serviceGenerationForEffect = Effect.fn("Jobs.serviceGenerationFor")(
  function* (work: NormalizationWork, job: NormalizedDescriptor, profile?: string) {
    const value = isRecord(job.value) ? job.value : {};
    if (typeof value.serviceGeneration === "string" && value.serviceGeneration.length > 0)
      return value.serviceGeneration;
    const application = work.descriptors.find((entry) => entry.kind === "app")?.value;
    const selected =
      profile ?? selectedProviderProfile(application, "job", text(value.service ?? value.profile));
    const profiles = isRecord(application)
      ? providerMaps(application).find(([capability]) => capability === "job")?.[1]
      : undefined;
    const binding = selected !== undefined && isRecord(profiles) ? profiles[selected] : undefined;
    return yield* hashEffect({
      profile: selected ?? "default",
      provider: yield* stableValueEffect(binding),
    });
  },
  (effect) => observeJobs("serviceGeneration", effect, () => ({ jobs: 1 })),
);

/**
 * Uses an explicit generation or hashes the selected provider binding.
 * @param work - Mutable caller-owned normalization workspace and authoritative indexes.
 * @param job - Normalized job binding being projected or checked.
 * @param profile - Selected provider profile; omission uses the application's selection.
 * @returns the stable service generation identity.
 * @see {@link serviceGenerationForEffect} for composition and execution examples.
 */
export function serviceGenerationFor(
  work: NormalizationWork,
  job: NormalizedDescriptor,
  profile?: string,
): string {
  return runJobsSync(serviceGenerationForEffect(work, job, profile));
}
