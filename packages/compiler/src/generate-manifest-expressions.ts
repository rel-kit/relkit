import { normalizeSourcePath } from "@zsys/contracts";
import type { Diagnostic } from "@zsys/diagnostics";
import type { EvaluatorManifestReference } from "./discovery/evaluator-protocol.js";
import type { ManifestGenerationInput } from "./generate-manifest.js";
import {
  isRecord,
  generatedAgentMarker,
  missingReference,
  referenceId,
  type ImportBinding,
} from "./generate-manifest-utils.js";
import type { NormalizedDescriptor } from "./normalize-types.js";

export function functionExpressionsFor(
  functions: readonly NormalizedDescriptor[],
  functionById: ReadonlyMap<string, NormalizedDescriptor>,
  bindings: ReadonlyMap<string, ImportBinding>,
  input: ManifestGenerationInput,
  diagnostics: Diagnostic[],
): ReadonlyMap<string, string> {
  const expressions = new Map<string, string>();
  for (const descriptor of functions) {
    const generated = isGeneratedFunction(descriptor.value);
    if (generated !== undefined) {
      expressions.set(
        descriptor.id,
        `__zsys_createGeneratedAgentFunction(${JSON.stringify(generated.agentId)})`,
      );
      continue;
    }
    const reference = executableExpression(descriptor, "handler", bindings, input);
    const liveHandler =
      isRecord(descriptor.value) && typeof descriptor.value.handler === "function";
    if (reference !== undefined) expressions.set(descriptor.id, reference);
    else if (descriptor.reference === undefined && liveHandler)
      expressions.set(descriptor.id, "undefined");
    else missingReference(diagnostics, descriptor, "function");
  }
  for (const id of functionById.keys()) if (!expressions.has(id)) expressions.set(id, "undefined");
  return expressions;
}

/** Returns the imported descriptors used by the runtime engine for validation and dependencies. */
export function functionTargetExpressionsFor(
  functions: readonly NormalizedDescriptor[],
  bindings: ReadonlyMap<string, ImportBinding>,
  input: ManifestGenerationInput,
): ReadonlyMap<string, string> {
  const expressions = new Map<string, string>();
  for (const descriptor of functions) {
    const expression = executableExpression(descriptor, "descriptor", bindings, input);
    if (expression !== undefined) expressions.set(descriptor.id, expression);
  }
  return expressions;
}

/** Returns the imported app descriptor needed to construct runtime providers. */
export function applicationExpressionFor(
  descriptor: NormalizedDescriptor | undefined,
  bindings: ReadonlyMap<string, ImportBinding>,
  input: ManifestGenerationInput,
): string | undefined {
  return descriptor === undefined
    ? undefined
    : executableExpression(descriptor, "descriptor", bindings, input);
}

export function descriptorExpressionsFor(
  descriptors: readonly NormalizedDescriptor[],
  bindings: ReadonlyMap<string, ImportBinding>,
  input: ManifestGenerationInput,
): ReadonlyMap<string, string> {
  return new Map(
    descriptors.flatMap((descriptor) => {
      const expression = executableExpression(descriptor, "descriptor", bindings, input);
      return expression === undefined ? [] : [[descriptor.id, expression] as const];
    }),
  );
}

function isGeneratedFunction(value: unknown): ReturnType<typeof generatedAgentMarker> | undefined {
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

export function transformExpressionsFor(
  transforms: readonly NormalizedDescriptor[],
  bindings: ReadonlyMap<string, ImportBinding>,
  input: ManifestGenerationInput,
  diagnostics: Diagnostic[],
): ReadonlyMap<string, string> {
  const expressions = new Map<string, string>();
  for (const descriptor of transforms) {
    const expression = executableExpression(descriptor, "schema", bindings, input);
    const liveSchema = isExecutableSchema(descriptor.value);
    if (expression !== undefined) expressions.set(descriptor.id, expression);
    else if (descriptor.reference === undefined && liveSchema)
      expressions.set(descriptor.id, "undefined");
    else missingReference(diagnostics, descriptor, "transform");
  }
  return expressions;
}

export function middlewareExpressionsFor(
  middleware: readonly NormalizedDescriptor[],
  functionById: ReadonlyMap<string, NormalizedDescriptor>,
  functions: ReadonlyMap<string, string>,
  diagnostics: Diagnostic[],
): ReadonlyMap<string, string> {
  const expressions = new Map<string, string>();
  middleware.forEach((descriptor, index) => {
    const target = functionById.get(referenceId(descriptor.value) ?? "");
    const targetExpression = target === undefined ? undefined : functions.get(target.id);
    if (target === undefined || targetExpression === undefined) {
      missingReference(diagnostics, descriptor, "middleware");
      return;
    }
    expressions.set(descriptor.id, `__zsys_middleware_${index}`);
  });
  return expressions;
}

function executableExpression(
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

function isExecutableSchema(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.schema) || !isRecord(value.schema["~standard"]))
    return false;
  return typeof value.schema["~standard"].validate === "function";
}
