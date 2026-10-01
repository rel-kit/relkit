import { SourceLocationError } from "@relkit/contracts";
import type { IdentityBinding } from "./generate-manifest-identities.types.js";
import { normalizeSourcePath } from "@relkit/contracts";
import type { ManifestGenerationInput } from "./generate-manifest.js";
import type { ImportBinding } from "./generate-manifest-utils.js";
import type { NormalizedDescriptor } from "./normalize-types.js";

/**
 * Emits deterministic runtime bindings for imported descriptors and nested errors.
 * @param descriptors - Ordered normalized descriptors.
 * @param bindings - Source modules indexed by their deterministic import aliases.
 * @param input - Compiler input and source provenance.
 * @returns Deterministically ordered runtime identity binding statements.
 */
export function identityBindingStatements(
  descriptors: readonly NormalizedDescriptor[],
  bindings: ReadonlyMap<string, ImportBinding>,
  input: ManifestGenerationInput,
): readonly string[] {
  const entries = descriptors.flatMap((descriptor) =>
    descriptorBindings(descriptor, bindings, input),
  );
  const seen = new Set<string>();
  return Object.freeze(
    entries
      .sort(compareBindings)
      .filter((entry) => {
        const key = `${entry.module}\0${entry.exportName}\0${pathKey(entry.path)}\0${entry.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((entry) => {
        const binding = bindings.get(entry.module);
        if (binding === undefined) return "";
        const root = `${binding.alias}[${JSON.stringify(entry.exportName)}]`;
        const value = entry.path.reduce(
          (expression, segment) => `${expression}[${JSON.stringify(segment)}]`,
          root,
        );
        return `__relkit_bindDescriptorIdentity(${value}, ${JSON.stringify(entry.id)});`;
      })
      .filter(Boolean),
  );
}

/**
 * Collects executable identity bindings for one descriptor and nested metadata.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @param bindings - Source modules indexed by their deterministic import aliases.
 * @param input - Compiler input and source provenance.
 * @returns Identity bindings for the descriptor and source-local nested metadata.
 */
function descriptorBindings(
  descriptor: NormalizedDescriptor,
  bindings: ReadonlyMap<string, ImportBinding>,
  input: ManifestGenerationInput,
): IdentityBinding[] {
  const reference = descriptor.reference;
  if (reference === undefined) return [];
  const module = modulePath(reference.module, input);
  if (module === undefined || bindings.has(module) === false) return [];
  const entries: IdentityBinding[] = [
    {
      module,
      exportName: reference.exportName,
      path: [],
      id: descriptor.id,
    },
  ];
  collectNested(descriptor.value, [], module, reference.exportName, entries, new Set());
  return entries;
}

/**
 * Collects nested executable bindings with ancestor ownership and cycle detection.
 * @param value - Declared metadata inspected without coercion.
 * @param path - Portable source, property, or runtime path.
 * @param module - Authored source module path.
 * @param exportName - Declared source export name.
 * @param entries - Ordered entries to validate or index.
 * @param active - Ancestor identities owned by the current recursive branch.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
function collectNested(
  value: unknown,
  path: readonly (string | number)[],
  module: string,
  exportName: string,
  entries: IdentityBinding[],
  active: Set<object>,
): void {
  if (Array.isArray(value)) {
    if (active.has(value)) return;
    active.add(value);
    value.forEach((entry, index) =>
      collectNested(entry, [...path, index], module, exportName, entries, active),
    );
    active.delete(value);
    return;
  }
  if (!isObjectLike(value) || active.has(value)) return;
  active.add(value);
  if (path.length > 0) {
    if (isIdentityRecord(value)) {
      entries.push({ module, exportName, path, id: value.id });
    } else if (isFunctionTarget(value)) {
      entries.push({ module, exportName, path, id: value.ref.id });
    }
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record).sort()) {
    collectNested(record[key], [...path, key], module, exportName, entries, active);
  }
  active.delete(value);
}

/**
 * Recognizes graph-visible descriptor identity metadata.
 * @param value - Declared metadata inspected without coercion.
 * @returns True when the value carries an identity that can be bound at runtime.
 */
function isIdentityRecord(value: object): value is { readonly kind: string; readonly id: string } {
  const candidate = value as Record<string, unknown>;
  const ref = candidate.ref;
  return (
    typeof candidate.kind === "string" &&
    typeof candidate.id === "string" &&
    isObjectLike(ref) &&
    (ref as Record<string, unknown>).kind === candidate.kind &&
    (ref as Record<string, unknown>).id === candidate.id
  );
}

/**
 * Recognizes a function reference used by generated executable targets.
 * @param value - Declared metadata inspected without coercion.
 * @returns True when the reference identifies an executable function target.
 */
function isFunctionTarget(value: object): value is {
  readonly ref: { readonly kind: "function"; readonly id: string };
} {
  const candidate = value as Record<string, unknown>;
  const ref = candidate.ref;
  return (
    !Object.hasOwn(candidate, "id") &&
    isObjectLike(ref) &&
    (ref as Record<string, unknown>).kind === "function" &&
    typeof (ref as Record<string, unknown>).id === "string"
  );
}

/**
 * Recognizes objects and functions that support own-property inspection.
 * @param value - Declared metadata inspected without coercion.
 * @returns True for a nonnull object or function.
 */
function isObjectLike(value: unknown): value is Record<string, unknown> {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

/**
 * Normalizes executable reference module paths against the project root.
 * @param module - Authored source module path.
 * @param input - Compiler input and source provenance.
 * @returns A portable source module path, or undefined for an invalid reference.
 */
function modulePath(module: string, input: ManifestGenerationInput): string | undefined {
  try {
    return normalizeSourcePath(module, input.projectRoot);
  } catch (error) {
    if (!(error instanceof SourceLocationError)) throw error;
    return undefined;
  }
}

/**
 * Orders identity bindings by source module, export, and property path.
 * @param left - First value to compare.
 * @param right - Second value to compare.
 * @returns The ordering result or precedence rank.
 */
function compareBindings(left: IdentityBinding, right: IdentityBinding): number {
  return (
    left.module.localeCompare(right.module) ||
    left.exportName.localeCompare(right.exportName) ||
    pathKey(left.path).localeCompare(pathKey(right.path)) ||
    left.id.localeCompare(right.id)
  );
}

/**
 * Encodes a nested metadata property path as a stable lookup key.
 * @param path - Portable source, property, or runtime path.
 * @returns A stable lookup key for a nested metadata property path.
 */
function pathKey(path: readonly (string | number)[]): string {
  return path.map((segment) => String(segment)).join("\0");
}
