import { isDescriptor } from "@relkit/contracts";
import { createDiagnostic } from "@relkit/diagnostics";
import type { ExtractedDescriptor } from "./discovery/extract.js";
import {
  NORMALIZE_CODES,
  isDescriptorKindValue,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";
import { id, isRecord, refId, refKind, source, text, positive, json } from "./normalize-utils.js";

export function toDescriptor(
  entry: unknown,
  input: NormalizationWork["input"],
  index: number,
): NormalizedDescriptor {
  const extracted = isExtracted(entry) ? entry : undefined;
  const value =
    extracted?.descriptor ?? (isRecord(entry) && "descriptor" in entry ? entry.descriptor : entry);
  const snapshot =
    isRecord(value) && isRecord(value.metadata)
      ? { ...value.metadata, kind: value.kind, id: value.id, ref: value.ref }
      : value;
  const kind = isRecord(snapshot) && typeof snapshot.kind === "string" ? snapshot.kind : "unknown";
  const rawId = isRecord(snapshot) ? snapshot.id : undefined;
  const descriptorId = id(rawId) ?? `unknown-${index + 1}`;
  const sourceValue = extracted?.source ?? (isRecord(entry) ? entry.source : undefined);
  return {
    kind,
    id: descriptorId,
    source: source(sourceValue, input),
    exportName:
      extracted?.exportName ??
      (isRecord(entry) && typeof entry.exportName === "string" ? entry.exportName : "default"),
    exportKind: extracted?.exportKind ?? "default",
    ...(extracted?.facts === undefined ? {} : { facts: extracted.facts }),
    ...(extracted?.exportFact === undefined ? {} : { exportFact: extracted.exportFact }),
    ...(extracted?.reference === undefined ? {} : { reference: extracted.reference }),
    value: snapshot,
  };
}

export function isExtracted(value: unknown): value is ExtractedDescriptor {
  return (
    isRecord(value) &&
    isRecord(value.descriptor) &&
    typeof value.exportName === "string" &&
    isRecord(value.source)
  );
}

export function isDescriptorLike(value: NormalizedDescriptor): boolean {
  return (
    (isDescriptorKindValue(value.kind) ||
      value.kind === "middleware" ||
      value.kind === "transform") &&
    (isDescriptor(value.value) || isRecord(value.value))
  );
}

export function targetFields(kind: string): readonly [string, string][] {
  return ["route", "job", "event-trigger", "tool"].includes(kind) ? [["target", "function"]] : [];
}

export function validateDependencies(
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
  dependencies: unknown,
): void {
  if (!isRecord(dependencies)) return;
  for (const [category, refs] of Object.entries(dependencies)) {
    if (!isRecord(refs)) continue;
    for (const reference of Object.values(refs)) {
      const targetId = refId(reference);
      const targetKind = refKind(reference);
      if (
        targetId === undefined ||
        targetKind !== dependencyKind(category) ||
        work.referencesByKind.get(targetKind)?.has(targetId) !== true
      ) {
        add(
          work,
          descriptor,
          NORMALIZE_CODES.missingTarget,
          `Dependency ${category} does not resolve to a known descriptor.`,
        );
      }
    }
  }
}

function dependencyKind(category: string): string {
  return (
    (
      {
        jobs: "job",
        events: "event",
        buckets: "bucket",
        cache: "cache",
        agents: "agent",
      } as Record<string, string>
    )[category] ?? "unknown"
  );
}

export function validateRetry(
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
  value: Record<string, any>,
  required = false,
): void {
  if (!isRecord(value.retry)) {
    if (required) add(work, descriptor, NORMALIZE_CODES.retry, "Retry policy is required.");
    return;
  }
  const multiplier = value.retry.multiplier;
  if (
    !positive(value.retry.maxAttempts) ||
    typeof multiplier !== "number" ||
    !Number.isFinite(multiplier) ||
    multiplier < 1 ||
    !["none", "full", "equal"].includes(value.retry.jitter) ||
    !Number.isSafeInteger(value.retry.initialDelayMs) ||
    !Number.isSafeInteger(value.retry.maxDelayMs) ||
    value.retry.initialDelayMs < 0 ||
    value.retry.maxDelayMs < value.retry.initialDelayMs
  )
    add(work, descriptor, NORMALIZE_CODES.retry, "Retry policy is invalid.");
}

export function normalizeRetry(value: Record<string, any>): Record<string, any> {
  return {
    ...value,
    jitter: typeof value.jitter === "string" ? value.jitter.trim().toLowerCase() : value.jitter,
  };
}

export function normalizeSchedule(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return {
    ...value,
    id: id(value.id) ?? text(value.id) ?? value.id,
    cron: typeof value.cron === "string" ? value.cron.trim().replace(/\s+/g, " ") : value.cron,
    timezone: text(value.timezone) ?? value.timezone,
  };
}

export function add(
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
  code: string,
  message: string,
  severity: "info" | "warning" | "error" = "error",
  related?: NormalizedDescriptor,
  suggestion?: string,
): void {
  work.diagnostics.push(
    createDiagnostic({
      code,
      severity,
      message,
      descriptorId: descriptor.id,
      location: descriptor.source,
      ...(related === undefined
        ? {}
        : { related: [{ ...related.source, descriptorId: related.id }] }),
      ...(suggestion === undefined ? {} : { suggestion }),
    }),
  );
}
