import { SourceLocationError } from "@relkit/contracts";
import { normalizeSourcePath } from "@relkit/contracts";
import type { EvaluatorManifestReference } from "./discovery/evaluator-protocol.js";
import type { ManifestGenerationInput } from "./generate-manifest.js";
import { generatedAgentMarker, isRecord, type ImportBinding } from "./generate-manifest-utils.js";
import type { NormalizedDescriptor } from "./normalize-types.js";

/**
 * Renders an executable source binding or generated function expression.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @param property - Declared property to inspect.
 * @param bindings - Source modules indexed by their deterministic import aliases.
 * @param input - Compiler input and source provenance.
 * @returns The executable binding expression, or undefined with a missing-binding diagnostic.
 */
export function executableExpression(
  descriptor: NormalizedDescriptor,
  property: "handler" | "schema" | "descriptor",
  bindings: ReadonlyMap<string, ImportBinding>,
  input: ManifestGenerationInput,
): string | undefined {
  const reference = descriptor.reference;
  if (
    reference === undefined ||
    reference.kind !== descriptor.kind ||
    reference.descriptorId !== descriptor.id
  )
    return undefined;
  const module = modulePath(reference, input);
  const binding = module === undefined ? undefined : bindings.get(module);
  if (binding === undefined) return undefined;
  const value = `${binding.alias}[${JSON.stringify(reference.exportName)}]`;
  return property === "descriptor" ? value : `${value}.${property}`;
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
 * Recognizes a live Standard Schema capability.
 * @param value - Declared metadata inspected without coercion.
 * @returns True when source-bound schema metadata requires an executable registry binding.
 */
export function isExecutableSchema(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.schema) || !isRecord(value.schema["~standard"]))
    return false;
  return typeof value.schema["~standard"].validate === "function";
}

/**
 * Checks whether metadata retains an executable callback property.
 * @param value - Declared metadata inspected without coercion.
 * @param property - Declared property to inspect.
 * @returns True when the property represents a source-bound executable value.
 */
export function isExecutableProperty(value: unknown, property: string): boolean {
  if (!isRecord(value)) return false;
  const candidate = value[property];
  return (
    typeof candidate === "function" || (isRecord(candidate) && candidate.$relkit === "function")
  );
}

/**
 * Recognizes data-only generated agent function markers.
 * @param value - Declared metadata inspected without coercion.
 * @returns The trusted generated agent marker, or undefined.
 */
export function isGeneratedFunction(
  value: unknown,
): ReturnType<typeof generatedAgentMarker> | undefined {
  if (!isRecord(value) || !isRecord(value.generated)) return undefined;
  if (
    value.generated.generated !== true ||
    value.generated.generatedBy !== "agent" ||
    typeof value.generated.agentId !== "string" ||
    typeof value.generated.functionId !== "string"
  )
    return undefined;
  return value.generated as ReturnType<typeof generatedAgentMarker>;
}
