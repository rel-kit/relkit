import { normalizeSourcePath } from "@relkit/contracts";
import type { EvaluatorManifestReference } from "./discovery/evaluator-protocol.js";
import type { ManifestGenerationInput } from "./generate-manifest.js";
import { generatedAgentMarker, isRecord, type ImportBinding } from "./generate-manifest-utils.js";
import type { NormalizedDescriptor } from "./normalize-types.js";

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

export function isExecutableSchema(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.schema) || !isRecord(value.schema["~standard"]))
    return false;
  return typeof value.schema["~standard"].validate === "function";
}

export function isExecutableProperty(value: unknown, property: string): boolean {
  if (!isRecord(value)) return false;
  const candidate = value[property];
  return (
    typeof candidate === "function" || (isRecord(candidate) && candidate.$relkit === "function")
  );
}

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
