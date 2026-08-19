import { createDiagnostic, type Diagnostic } from "@zsys/diagnostics";
import { normalizeSourcePath } from "@zsys/contracts";
import type { EvaluatorManifestReference } from "./discovery/evaluator-protocol.js";
import type { ManifestGenerationInput } from "./generate-manifest.js";
import type { NormalizedDescriptor } from "./normalize-types.js";

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
          code: "ZSYS_DUPLICATE_ID",
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
  functionById: ReadonlyMap<string, NormalizedDescriptor>,
  input: ManifestGenerationInput,
  application?: NormalizedDescriptor,
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
  for (const descriptor of middleware) add(functionById.get(referenceId(descriptor.value) ?? ""));
  add(application);
  return [...modules].sort();
}

export function importBindings(modules: readonly string[]): ReadonlyMap<string, ImportBinding> {
  return new Map(
    modules.map((module, index) => [module, { module, alias: `__zsys_module_${index}` }]),
  );
}

export function providerTags(descriptors: readonly NormalizedDescriptor[]): readonly string[] {
  const tags = new Set<string>();
  const app = descriptors.find((descriptor) => descriptor.kind === "app");
  const providers =
    app && isRecord(app.value) && isRecord(app.value.providers) ? app.value.providers : {};
  const defaults: Readonly<Record<string, string>> = {
    development: "local",
    test: "test",
    production: "aws",
  };
  for (const environment of Object.keys(providers).sort()) {
    const provider = providers[environment];
    const tag = isRecord(provider)
      ? typeof provider.recipeTag === "string"
        ? provider.recipeTag
        : typeof provider.recipe === "string"
          ? provider.recipe
          : undefined
      : undefined;
    tags.add(tag ?? defaults[environment] ?? environment);
  }
  return [...tags].sort();
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
      ? "ZSYS_MANIFEST_HANDLER_MISSING"
      : kind === "transform"
        ? "ZSYS_MANIFEST_TRANSFORM_MISSING"
        : "ZSYS_MANIFEST_MIDDLEWARE_MISSING";
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
    functionId: `zsys.agent.${agentId}.invoke`,
  };
}
