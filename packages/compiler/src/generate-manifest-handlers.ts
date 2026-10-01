import type { Diagnostic } from "@relkit/diagnostics";
import type { ManifestGenerationInput } from "./generate-manifest.js";
import { missingReference, type ImportBinding } from "./generate-manifest-utils.js";
import type { NormalizedDescriptor } from "./normalize-types.js";

import {
  executableExpression,
  isExecutableProperty,
  isExecutableSchema,
} from "./generate-manifest-expression-support.js";

/**
 * Renders executable transforms and records missing source bindings.
 * @param transforms - Transform descriptors participating in generation.
 * @param bindings - Source modules indexed by their deterministic import aliases.
 * @param input - Compiler input and source provenance.
 * @param diagnostics - Ordered compiler diagnostics.
 * @returns Transform IDs mapped to executable source expressions.
 */
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

/**
 * Renders middleware handlers in normalized execution order.
 * @param middleware - Middleware descriptor or path being compared.
 * @param bindings - Source modules indexed by their deterministic import aliases.
 * @param input - Compiler input and source provenance.
 * @param diagnostics - Ordered compiler diagnostics.
 * @returns Middleware IDs mapped to handlers in normalized execution order.
 */
export function middlewareExpressionsFor(
  middleware: readonly NormalizedDescriptor[],
  bindings: ReadonlyMap<string, ImportBinding>,
  input: ManifestGenerationInput,
  diagnostics: Diagnostic[],
): ReadonlyMap<string, string> {
  const expressions = new Map<string, string>();
  for (const descriptor of middleware) {
    const expression = executableExpression(descriptor, "descriptor", bindings, input);
    if (expression !== undefined) expressions.set(descriptor.id, expression);
    else if (
      descriptor.reference === undefined &&
      isExecutableProperty(descriptor.value, "handler")
    )
      expressions.set(descriptor.id, "undefined");
    else missingReference(diagnostics, descriptor, "middleware");
  }
  return expressions;
}

/**
 * Renders executable lifecycle hook bindings.
 * @param descriptors - Ordered normalized descriptors.
 * @param bindings - Source modules indexed by their deterministic import aliases.
 * @param input - Compiler input and source provenance.
 * @returns Hook IDs mapped to executable lifecycle expressions.
 */
export function hookExpressionsFor(
  descriptors: readonly NormalizedDescriptor[],
  bindings: ReadonlyMap<string, ImportBinding>,
  input: ManifestGenerationInput,
): ReadonlyMap<string, string> {
  const expressions = new Map<string, string>();
  for (const descriptor of descriptors) {
    if (descriptor.kind === "task") {
      const target = executableExpression(descriptor, "descriptor", bindings, input);
      for (const phase of ["start", "success", "failure"] as const) {
        const property =
          phase === "start" ? "onStart" : phase === "success" ? "onSuccess" : "onFailure";
        if (!isExecutableProperty(descriptor.value, property)) continue;
        expressions.set(
          `${descriptor.id}.${phase}`,
          target === undefined ? "undefined" : `${target}.${property}`,
        );
      }
      continue;
    }
    if (descriptor.kind !== "function" && descriptor.kind !== "tool") continue;
    const target = executableExpression(descriptor, "descriptor", bindings, input);
    for (const phase of ["before", "after"] as const) {
      const property = phase === "before" ? "onBefore" : "onAfter";
      if (!isExecutableProperty(descriptor.value, property)) continue;
      expressions.set(
        `${descriptor.id}.${phase}`,
        target === undefined ? "undefined" : `${target}.${property}`,
      );
    }
  }
  return expressions;
}
