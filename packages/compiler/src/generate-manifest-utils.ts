import { createDiagnostic, type Diagnostic } from "@relkit/diagnostics";
import { normalizeSourcePath } from "@relkit/contracts";
import type { EvaluatorManifestReference } from "./discovery/evaluator-protocol.js";
import type { ManifestGenerationInput } from "./generate-manifest.js";
import type { NormalizedDescriptor } from "./normalize-types.js";
import { providerMaps } from "./normalize-graph-app.js";

export interface ImportBinding {
  readonly module: string;
  readonly alias: string;
}

export function descriptorsOf(
  descriptors: readonly NormalizedDescriptor[],
  kind: string,
): readonly NormalizedDescriptor[] {
  return descriptors.filter((descriptor) => descriptor.kind === kind).sort(compareDescriptors);
}

export function generatedFunctionDescriptors(
  descriptors: readonly NormalizedDescriptor[],
): readonly NormalizedDescriptor[] {
  return descriptorsOf(descriptors, "agent").map((descriptor) => {
    const generated = generatedAgentMarker(descriptor.id);
    return {
      kind: "function",
      id: generated.functionId,
      source: descriptor.source,
      exportName: `<generated:${descriptor.id}>`,
      exportKind: "named",
      value: { kind: "function", id: generated.functionId, generated },
    };
  });
}

function compareDescriptors(left: NormalizedDescriptor, right: NormalizedDescriptor): number {
  return (
    left.id.localeCompare(right.id) ||
    left.source.file.localeCompare(right.source.file) ||
    left.source.line - right.source.line ||
    left.source.column - right.source.column ||
    left.exportName.localeCompare(right.exportName)
  );
}

export function uniqueById(
  descriptors: readonly NormalizedDescriptor[],
  diagnostics: Diagnostic[],
): ReadonlyMap<string, NormalizedDescriptor> {
  const result = new Map<string, NormalizedDescriptor>();
  for (const descriptor of descriptors) {
    const previous = result.get(descriptor.id);
    if (previous !== undefined) {
      diagnostics.push(
        createDiagnostic({
          code: "RELKIT_DUPLICATE_ID",
          severity: "error",
          message: `Duplicate function ID "${descriptor.id}" cannot be registered twice.`,
          descriptorId: descriptor.id,
          location: descriptor.source,
          related: [{ ...previous.source, descriptorId: previous.id }],
        }),
      );
      continue;
    }
    result.set(descriptor.id, descriptor);
  }
  return result;
}

export function collectModules(
  functions: readonly NormalizedDescriptor[],
  middleware: readonly NormalizedDescriptor[],
  transforms: readonly NormalizedDescriptor[],
  input: ManifestGenerationInput,
  application?: NormalizedDescriptor,
  runtimeDescriptors: readonly NormalizedDescriptor[] = [],
): readonly string[] {
  const modules = new Set<string>();
  const add = (descriptor: NormalizedDescriptor | undefined): void => {
    const reference = descriptor?.reference;
    if (reference === undefined) return;
    const module = modulePath(reference, input);
    if (module !== undefined) modules.add(module);
  };
  functions.forEach(add);
  transforms.forEach(add);
  middleware.forEach(add);
  add(application);
  runtimeDescriptors.forEach(add);
  return [...modules].sort();
}

export function importBindings(modules: readonly string[]): ReadonlyMap<string, ImportBinding> {
  return new Map(
    modules.map((module, index) => [module, { module, alias: `__relkit_module_${index}` }]),
  );
}

export function providerFactoryKeys(
  descriptors: readonly NormalizedDescriptor[],
): readonly string[] {
  const keys = new Set<string>();
  const app = descriptors.find((descriptor) => descriptor.kind === "app");
  const value = app && isRecord(app.value) ? app.value : {};
  for (const [capability, profiles] of providerMaps(value)) {
    if (!isRecord(profiles)) continue;
    for (const binding of Object.values(profiles)) {
      const adapter = isRecord(binding) && isRecord(binding.adapter) ? binding.adapter : {};
      if (typeof adapter.adapter === "string") keys.add(`${capability}:${adapter.adapter}`);
    }
  }
  return [...keys].sort();
}

function modulePath(
  reference: EvaluatorManifestReference,
  input: ManifestGenerationInput,
): string | undefined {
  try {
    return normalizeSourcePath(reference.module, input.projectRoot);
  } catch {
    return undefined;
  }
}

export function referenceId(value: unknown): string | undefined {
  return isRecord(value) &&
    isRecord(value.target) &&
    isRecord(value.target.ref) &&
    value.target.ref.kind === "function" &&
    typeof value.target.ref.id === "string"
    ? value.target.ref.id
    : undefined;
}

export function missingReference(
  diagnostics: Diagnostic[],
  descriptor: NormalizedDescriptor | undefined,
  kind: string,
): void {
  if (descriptor === undefined) return;
  const code =
    kind === "function"
      ? "RELKIT_MANIFEST_HANDLER_MISSING"
      : kind === "transform"
        ? "RELKIT_MANIFEST_TRANSFORM_MISSING"
        : "RELKIT_MANIFEST_MIDDLEWARE_MISSING";
  diagnostics.push(
    createDiagnostic({
      code,
      severity: "error",
      message: `Manifest ${kind} "${descriptor.id}" has no executable reference.`,
      descriptorId: descriptor.id,
      location: descriptor.source,
    }),
  );
}

export function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function generatedAgentMarker(agentId: string): {
  readonly generated: true;
  readonly generatedBy: "agent";
  readonly agentId: string;
  readonly functionId: string;
} {
  return {
    generated: true,
    generatedBy: "agent",
    agentId,
    functionId: `relkit.agent.${agentId}.invoke`,
  };
}
