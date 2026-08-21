import { normalizeSourcePath } from "@zsys/contracts";
import type { ManifestGenerationInput } from "./generate-manifest.js";
import type { ImportBinding } from "./generate-manifest-utils.js";
import type { NormalizedDescriptor } from "./normalize-types.js";

interface IdentityBinding {
  readonly module: string;
  readonly exportName: string;
  readonly path: readonly (string | number)[];
  readonly id: string;
}

/** Emits deterministic runtime bindings for imported descriptors and nested errors. */
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
        return `__zsys_bindDescriptorIdentity(${value}, ${JSON.stringify(entry.id)});`;
      })
      .filter(Boolean),
  );
}

function descriptorBindings(
  descriptor: NormalizedDescriptor,
  bindings: ReadonlyMap<string, ImportBinding>,
  input: ManifestGenerationInput,
): IdentityBinding[] {
  if (isGeneratedEventListener(descriptor.value)) return [];
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

function isGeneratedEventListener(value: unknown): boolean {
  if (!isObjectLike(value)) return false;
  const generated = (value as Record<string, unknown>).generated;
  return (
    isObjectLike(generated) &&
    (generated as Record<string, unknown>).generatedBy === "event-listener"
  );
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function modulePath(module: string, input: ManifestGenerationInput): string | undefined {
  try {
    return normalizeSourcePath(module, input.projectRoot);
  } catch {
    return undefined;
  }
}

function compareBindings(left: IdentityBinding, right: IdentityBinding): number {
  return (
    left.module.localeCompare(right.module) ||
    left.exportName.localeCompare(right.exportName) ||
    pathKey(left.path).localeCompare(pathKey(right.path)) ||
    left.id.localeCompare(right.id)
  );
}

function pathKey(path: readonly (string | number)[]): string {
  return path.map((segment) => String(segment)).join("\0");
}
