import { SourceLocationError } from "@relkit/contracts";
import type { ImportBinding } from "./generate-manifest-utils.types.js";
export type { ImportBinding } from "./generate-manifest-utils.types.js";
import { createDiagnostic, type Diagnostic } from "@relkit/diagnostics";
import { normalizeSourcePath } from "@relkit/contracts";
import type { EvaluatorManifestReference } from "./discovery/evaluator-protocol.js";
import type { ManifestGenerationInput } from "./generate-manifest.js";
import type { NormalizedDescriptor } from "./normalize-types.js";

/**
 * Selects descriptors of one kind without changing their order.
 * @param descriptors - Ordered normalized descriptors.
 * @param kind - Descriptor or syntax category.
 * @returns Matching descriptors in their original order.
 */
export function descriptorsOf(
  descriptors: readonly NormalizedDescriptor[],
  kind: string,
): readonly NormalizedDescriptor[] {
  return descriptors.filter((descriptor) => descriptor.kind === kind).sort(compareDescriptors);
}

/**
 * Selects graph-generated functions requiring manifest expressions.
 * @param descriptors - Ordered normalized descriptors.
 * @returns Functions synthesized by graph normalization.
 */
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

/**
 * Orders descriptors by identity and portable source position.
 * @param left - First value to compare.
 * @param right - Second value to compare.
 * @returns The ordering result or precedence rank.
 */
function compareDescriptors(left: NormalizedDescriptor, right: NormalizedDescriptor): number {
  return (
    left.id.localeCompare(right.id) ||
    left.source.file.localeCompare(right.source.file) ||
    left.source.line - right.source.line ||
    left.source.column - right.source.column ||
    left.exportName.localeCompare(right.exportName)
  );
}

/**
 * Deduplicates descriptor bindings and records conflicting identities.
 * @param descriptors - Ordered normalized descriptors.
 * @param diagnostics - Ordered compiler diagnostics.
 * @returns One binding per ID, with conflicts recorded in the supplied diagnostic list.
 */
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

/**
 * Collects sorted source modules required by executable manifest bindings.
 * @param functions - Executable function descriptors.
 * @param middleware - Middleware descriptor or path being compared.
 * @param transforms - Transform descriptors participating in generation.
 * @param input - Compiler input and source provenance.
 * @param application - Application descriptor metadata.
 * @param runtimeDescriptors - Runtime-bound descriptors required by the manifest.
 * @returns Sorted, unique executable source module paths.
 */
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

/**
 * Assigns deterministic import aliases to source modules.
 * @param modules - Sorted source module paths requiring import aliases.
 * @returns Module paths mapped to deterministic import aliases.
 */
export function importBindings(modules: readonly string[]): ReadonlyMap<string, ImportBinding> {
  return new Map(
    modules.map((module, index) => [module, { module, alias: `__relkit_module_${index}` }]),
  );
}

/**
 * Normalizes executable reference module paths against the project root.
 * @param reference - Executable source reference carrying module and export provenance.
 * @param input - Compiler input and source provenance.
 * @returns A portable source module path, or undefined for an invalid reference.
 */
function modulePath(
  reference: EvaluatorManifestReference,
  input: ManifestGenerationInput,
): string | undefined {
  try {
    return normalizeSourcePath(reference.module, input.projectRoot);
  } catch (error) {
    if (!(error instanceof SourceLocationError)) throw error;
    return undefined;
  }
}

/**
 * Reads the identity from a generated executable reference.
 * @param value - Declared metadata inspected without coercion.
 * @returns The executable reference ID, or undefined.
 */
export function referenceId(value: unknown): string | undefined {
  return isRecord(value) &&
    isRecord(value.target) &&
    isRecord(value.target.ref) &&
    value.target.ref.kind === "function" &&
    typeof value.target.ref.id === "string"
    ? value.target.ref.id
    : undefined;
}

/**
 * Records a missing executable source binding.
 * @param diagnostics - Ordered compiler diagnostics.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @param kind - Descriptor or syntax category.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
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

/**
 * Recognizes nonnull nonarray objects for metadata inspection.
 * @param value - Declared metadata inspected without coercion.
 * @returns True for a nonnull, nonarray metadata object.
 */
export function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Constructs a data-only marker for an agent's generated function.
 * @param agentId - Stable ID of the owning agent.
 * @returns A data-only marker identifying the generated agent function.
 */
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
