import { isDescriptor } from "@relkit/contracts";
import { createDiagnostic } from "@relkit/diagnostics";
import type { ExtractedDescriptor } from "./discovery/extract.js";
import { type NormalizedDescriptor, type NormalizationWork } from "./normalize-types.js";
import { id, isDescriptorKindValue, isRecord, source } from "./normalize-utils.js";

/**
 * Attaches compiler identity and provenance to an extracted or live descriptor.
 * @param entry - Validated entry to project.
 * @param input - Compiler input and source provenance.
 * @param index - Descriptor position used for deterministic fallback identity.
 * @returns A descriptor carrying compiler identity and source/execution provenance.
 */
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
  const descriptorSource = source(sourceValue, input);
  const exportName =
    extracted?.exportName ??
    (isRecord(entry) && typeof entry.exportName === "string" ? entry.exportName : "default");
  const exportKind = extracted?.exportKind ?? "default";
  return {
    kind,
    id: descriptorId,
    source: descriptorSource,
    exportName,
    exportKind,
    ...(extracted?.facts === undefined ? {} : { facts: extracted.facts }),
    ...(extracted?.exportFact === undefined ? {} : { exportFact: extracted.exportFact }),
    ...(extracted?.reference === undefined ? {} : { reference: extracted.reference }),
    origin: { file: descriptorSource.file, exportName, exportKind },
    value: snapshot,
  };
}

/**
 * Recognizes an evaluator descriptor carrying source and executable references.
 * @param value - Declared metadata inspected without coercion.
 * @returns True when the input carries evaluator descriptor and source evidence.
 */
export function isExtracted(value: unknown): value is ExtractedDescriptor {
  return (
    isRecord(value) &&
    isRecord(value.descriptor) &&
    typeof value.exportName === "string" &&
    isRecord(value.source)
  );
}

/**
 * Checks normalized descriptor identity and supported reference shape.
 * @param value - Declared metadata inspected without coercion.
 * @returns True when kind, ID, and reference metadata form a descriptor.
 */
export function isDescriptorLike(value: NormalizedDescriptor): boolean {
  return (
    (isDescriptorKindValue(value.kind) ||
      value.kind === "middleware" ||
      value.kind === "transform" ||
      value.kind === "error") &&
    (isDescriptor(value.value) || isRecord(value.value))
  );
}

/**
 * Selects descriptor fields that represent executable targets.
 * @param kind - Descriptor or syntax category.
 * @returns Metadata field names paired with their required target kinds.
 */
export function targetFields(kind: string): readonly [string, string][] {
  return ["route", "job", "event-trigger", "tool"].includes(kind) ? [["target", "function"]] : [];
}

/**
 * Maps a dependency group to its referenced descriptor kind.
 * @param category - TypeScript diagnostic category or dependency group.
 * @returns The referenced descriptor kind required by the dependency group.
 */
export function dependencyKind(category: string): string {
  return (
    (
      {
        jobs: "job",
        tasks: "task",
        buckets: "bucket",
        cache: "cache",
        agents: "agent",
      } as Record<string, string>
    )[category] ?? "unknown"
  );
}

/**
 * Appends a diagnostic with descriptor and optional related-source evidence.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @param code - Stable diagnostic code.
 * @param message - Diagnostic message describing the rejected contract.
 * @param severity - Diagnostic severity, defaulting to error.
 * @param related - Related descriptor carrying the conflicting source location.
 * @param suggestion - Actionable authoring correction, when available.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
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
