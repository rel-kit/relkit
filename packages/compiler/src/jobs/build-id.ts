import { createHash } from "node:crypto";
import { canonicalJson, type JsonValue } from "@relkit/contracts";
import { providerMaps, selectedProviderProfile } from "../normalize-graph-app.js";
import type { NormalizedDescriptor, NormalizationWork } from "../normalize-types.js";
import { isRecord, refId, taskSchemaKey } from "../normalize-utils.js";
import { schema } from "../normalize-schema-projection.js";

export const JOB_BUILD_PROTOCOL_VERSION = 1 as const;

/** Hashes executable and contract inputs independently of the public job name. */
export function computeTaskBuildId(
  task: NormalizedDescriptor,
  work: NormalizationWork,
  adapterSemantics?: JsonValue,
): string {
  const value = isRecord(task.value) ? task.value : {};
  const identity = {
    protocolVersion: JOB_BUILD_PROTOCOL_VERSION,
    taskId: task.id,
    executable: stableValue(selectFields(value)),
    dependencies: dependencyClosure(work, value.dependencies),
    schemas: schemaHashes(work, task.id),
    adapter: adapterSemantics ?? null,
  } satisfies JsonValue;
  return hash(identity);
}

export function computeJobBuildId(
  job: NormalizedDescriptor,
  work: NormalizationWork,
): string | undefined {
  const value = isRecord(job.value) ? job.value : {};
  const taskId = refId(value.task);
  const task = taskId === undefined ? undefined : work.referencesByKind.get("task")?.get(taskId);
  if (task === undefined) return undefined;
  const profile = selectedProviderProfile(
    work.descriptors.find((entry) => entry.kind === "app")?.value,
    "job",
    typeof value.service === "string" ? value.service : typeof value.profile === "string" ? value.profile : undefined,
  );
  return computeTaskBuildId(task, work, {
    profile: profile ?? "default",
    serviceGeneration: serviceGenerationFor(work, job, profile),
  });
}

export function publicFingerprint(
  jobs: readonly NormalizedDescriptor[],
  work?: NormalizationWork,
): string {
  const entries = jobs
    .map((job) => {
      const value = isRecord(job.value) ? job.value : {};
      return {
        id: job.id,
        name: typeof value.name === "string" ? value.name : "",
        taskId: refId(value.task) ?? "",
        client: stableValue(value.client),
        ...(work === undefined ? {} : { service: serviceGenerationFor(work, job) }),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  return hash(entries);
}

export function serviceGenerationFor(
  work: NormalizationWork,
  job: NormalizedDescriptor,
  profile?: string,
): string {
  const value = isRecord(job.value) ? job.value : {};
  if (typeof value.serviceGeneration === "string" && value.serviceGeneration.length > 0)
    return value.serviceGeneration;
  const application = work.descriptors.find((entry) => entry.kind === "app")?.value;
  const selected = profile ?? selectedProviderProfile(application, "job", text(value.service ?? value.profile));
  const profiles = isRecord(application)
    ? providerMaps(application).find(([capability]) => capability === "job")?.[1]
    : undefined;
  const binding = selected !== undefined && isRecord(profiles) ? profiles[selected] : undefined;
  return hash({ profile: selected ?? "default", provider: stableValue(binding) });
}

function selectFields(value: Record<string, unknown>): Record<string, unknown> {
  const fields = [
    "input",
    "inputWire",
    "output",
    "errors",
    "execution",
    "dependencies",
    "publishes",
    "progress",
    "streams",
    "observation",
    "retry",
    "resources",
    "concurrency",
    "maxDuration",
    "maxElapsed",
    "logging",
    "handler",
    "onStart",
    "onSuccess",
    "onFailure",
  ];
  return Object.fromEntries(fields.flatMap((field) => (value[field] === undefined ? [] : [[field, value[field]]])));
}

function dependencyClosure(work: NormalizationWork, value: unknown): JsonValue {
  if (!isRecord(value)) return [];
  const refs = new Set<string>();
  collectRefs(value, refs);
  return [...refs].sort().map((reference) => {
    const separator = reference.indexOf("\0");
    const kind = separator < 0 ? "unknown" : reference.slice(0, separator);
    const id = separator < 0 ? reference : reference.slice(separator + 1);
    const descriptor = work.referencesByKind.get(kind)?.get(id);
    return { id, kind: descriptor?.kind ?? kind, version: versionOf(descriptor) };
  });
}

function collectRefs(value: unknown, result: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectRefs(entry, result));
    return;
  }
  if (!isRecord(value)) return;
  if (
    isRecord(value.ref) &&
    typeof value.ref.kind === "string" &&
    typeof value.ref.id === "string"
  ) {
    result.add(`${value.ref.kind}\0${value.ref.id}`);
  }
  Object.values(value).forEach((entry) => collectRefs(entry, result));
}

function versionOf(value: NormalizedDescriptor | undefined): string {
  return isRecord(value?.value) && typeof value.value.version === "string" ? value.value.version : "";
}

function schemaHashes(work: NormalizationWork, taskId: string): JsonValue {
  return Object.fromEntries(
    ["input", "output", "progress"].flatMap((field) =>
      ["input", "output"].flatMap((direction) => {
        const key = taskSchemaKey(taskId, field, direction as "input" | "output");
        const hashValue = work.schemaHashes.get(key);
        return hashValue === undefined ? [] : [[`${field}:${direction}`, hashValue]];
      }),
    ),
  );
}

function stableValue(value: unknown, seen = new WeakSet<object>()): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "function") return { $relkit: "function", source: value.toString() };
  if (typeof value === "undefined") return null;
  if (typeof value !== "object") return { $relkit: typeof value };
  if (seen.has(value)) return { $relkit: "cycle" };
  const projected = schema(value);
  if (projected.ok && projected.contractHash !== undefined)
    return { $relkit: "schema", contractHash: projected.contractHash };
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((entry) => stableValue(entry, seen));
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue((value as Record<string, unknown>)[key], seen)]));
  } finally {
    seen.delete(value);
  }
}

function hash(value: JsonValue): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}
