import { providerMaps, selectedProviderProfile } from "../normalize-graph-app.js";
import { add } from "../normalize-pass-utils.js";
import { NORMALIZE_CODES, type NormalizedDescriptor, type NormalizationWork } from "../normalize-types.js";
import { isRecord, refId } from "../normalize-utils.js";

const FEATURE_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  durable: ["durable-task", "durable-execution", "durable-sleep", "task-execution"],
  retryable: ["retryable-task", "retryable-execution", "task-execution", "retry"],
  schedules: ["schedules", "schedule", "native-schedule"],
  observation: ["observation", "read", "run-observation"],
  cancel: ["cancel", "cancellation", "run-cancel"],
  retry: ["retry", "run-retry"],
  streams: ["streams", "named-streams"],
  progress: ["progress", "durable-progress"],
  resources: ["resources", "worker-resources"],
});

export function validateProviderRequirements(
  work: NormalizationWork,
  job: NormalizedDescriptor,
  task: NormalizedDescriptor,
): void {
  const application = work.descriptors.find((entry) => entry.kind === "app")?.value;
  if (!isRecord(application)) return;
  const jobValue = isRecord(job.value) ? job.value : {};
  const taskValue = isRecord(task.value) ? task.value : {};
  const profile = selectedProviderProfile(
    application,
    "job",
    text(jobValue.service ?? jobValue.profile),
  );
  if (profile === undefined) return;
  const binding = bindingFor(application, profile);
  if (binding === undefined) return;
  const features = featureSet(binding);
  const required = new Map<string, readonly string[]>();
  required.set(taskValue.execution === "retryable" ? "retryable" : "durable", []);
  if (hasSchedules(jobValue)) required.set("schedules", []);
  if (isRecord(jobValue.client)) {
    const operations = Array.isArray(jobValue.client.operations) ? jobValue.client.operations : [];
    if (operations.some((operation) => ["get", "list", "watch"].includes(String(operation))))
      required.set("observation", []);
    if (operations.includes("cancel")) required.set("cancel", []);
    if (operations.includes("retry")) required.set("retry", []);
    if (operations.includes("stream")) required.set("streams", []);
  }
  if (taskValue.progress !== undefined || taskValue.observation?.progress !== undefined)
    required.set("progress", []);
  if (isRecord(taskValue.streams) || taskValue.observation?.streams !== undefined)
    required.set("streams", []);
  if (taskValue.resources !== undefined) required.set("resources", []);
  for (const name of required.keys()) {
    const aliases = FEATURE_ALIASES[name] ?? [name];
    if (aliases.some((alias) => features.has(normalizeFeature(alias)))) continue;
    add(
      work,
      job,
      NORMALIZE_CODES.jobCapability,
      `Jobs provider profile "${profile}" does not advertise the ${name} capability required by task "${task.id}".`,
      "error",
      undefined,
      `Select a certified jobs service or remove the ${name} requirement.`,
    );
  }
}

function bindingFor(application: Record<string, unknown>, profile: string): unknown {
  const profiles = providerMaps(application).find(([capability]) => capability === "job")?.[1];
  return isRecord(profiles) ? profiles[profile] : undefined;
}

function featureSet(binding: unknown): Set<string> {
  const adapter = isRecord(binding) && isRecord(binding.adapter) ? binding.adapter : {};
  const values = Array.isArray(adapter.features) ? adapter.features : [];
  return new Set(
    values.flatMap((feature) => {
      if (typeof feature === "string") return [normalizeFeature(feature)];
      return isRecord(feature) && typeof feature.id === "string"
        ? [normalizeFeature(feature.id)]
        : [];
    }),
  );
}

function hasSchedules(value: Record<string, unknown>): boolean {
  const schedules = value.schedules ?? value.schedule;
  return Array.isArray(schedules) && schedules.length > 0;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function normalizeFeature(value: string): string {
  return value.replace(/[._-]/gu, "").toLowerCase();
}

export function taskForJob(
  work: NormalizationWork,
  job: NormalizedDescriptor,
): NormalizedDescriptor | undefined {
  const value = isRecord(job.value) ? job.value : {};
  const taskId = refId(value.task);
  return taskId === undefined ? undefined : work.referencesByKind.get("task")?.get(taskId);
}
