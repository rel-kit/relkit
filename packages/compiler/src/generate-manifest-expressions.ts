import type { Diagnostic } from "@relkit/diagnostics";
import type { ManifestGenerationInput } from "./generate-manifest.js";
import { isRecord, missingReference, type ImportBinding } from "./generate-manifest-utils.js";
import type { NormalizedDescriptor } from "./normalize-types.js";
import { functionEventTargetExpression } from "./generate-manifest-event.js";
import {
  executableExpression,
  isGeneratedFunction,
} from "./generate-manifest-expression-support.js";

/**
 * Renders executable function registry expressions and validates their bindings.
 * @param functions - Executable function descriptors.
 * @param functionById - Authoritative functions indexed by stable identity.
 * @param bindings - Source modules indexed by their deterministic import aliases.
 * @param input - Compiler input and source provenance.
 * @param diagnostics - Ordered compiler diagnostics.
 * @returns Function IDs mapped to validated executable registry expressions.
 */
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
        `__relkit_createGeneratedAgentFunction(${JSON.stringify(generated.agentId)})`,
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

/**
 * Renders function target references for executable manifest generation.
 * @param functions - Executable function descriptors.
 * @param bindings - Source modules indexed by their deterministic import aliases.
 * @param input - Compiler input and source provenance.
 * @returns Function IDs mapped to executable target references.
 */
export function functionTargetExpressionsFor(
  functions: readonly NormalizedDescriptor[],
  bindings: ReadonlyMap<string, ImportBinding>,
  input: ManifestGenerationInput,
): ReadonlyMap<string, string> {
  const expressions = new Map<string, string>();
  for (const descriptor of functions) {
    const functionEvents = functionEventTargetExpression(descriptor, bindings, input);
    if (functionEvents !== undefined) {
      expressions.set(descriptor.id, functionEvents);
      continue;
    }
    const expression = executableExpression(descriptor, "descriptor", bindings, input);
    if (expression !== undefined) expressions.set(descriptor.id, expression);
  }
  return expressions;
}

/**
 * Renders task executable registry expressions.
 * @param tasks - Task descriptors participating in generation.
 * @param bindings - Source modules indexed by their deterministic import aliases.
 * @param input - Compiler input and source provenance.
 * @returns Task IDs mapped to executable registry expressions.
 */
export function taskExpressionsFor(
  tasks: readonly NormalizedDescriptor[],
  bindings: ReadonlyMap<string, ImportBinding>,
  input: ManifestGenerationInput,
): ReadonlyMap<string, string> {
  return new Map(
    tasks.flatMap((descriptor) => {
      const expression = executableExpression(descriptor, "descriptor", bindings, input);
      return expression === undefined ? [] : [[descriptor.id, expression] as const];
    }),
  );
}

/**
 * Renders task-backed and legacy job registry expressions.
 * @param jobs - Job bindings participating in generation.
 * @param bindings - Source modules indexed by their deterministic import aliases.
 * @param input - Compiler input and source provenance.
 * @param tasks - Task descriptors participating in generation.
 * @returns Job IDs mapped to task-backed or legacy executable expressions.
 */
export function jobExpressionsFor(
  jobs: readonly NormalizedDescriptor[],
  bindings: ReadonlyMap<string, ImportBinding>,
  input: ManifestGenerationInput,
  tasks: ReadonlyMap<string, string> = new Map(),
): ReadonlyMap<string, string> {
  return new Map(
    jobs.flatMap((descriptor) => {
      const expression = executableExpression(descriptor, "descriptor", bindings, input);
      if (expression !== undefined) return [[descriptor.id, expression] as const];
      const value = isRecord(descriptor.value) ? descriptor.value : {};
      const task =
        isRecord(value.task) && typeof value.task.ref?.id === "string"
          ? value.task.ref.id
          : undefined;
      const taskExpression = task === undefined ? undefined : tasks.get(task);
      return taskExpression === undefined
        ? []
        : [[descriptor.id, `{ task: ${taskExpression} }`] as const];
    }),
  );
}

/**
 * Renders the selected application executable binding.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @param bindings - Source modules indexed by their deterministic import aliases.
 * @param input - Compiler input and source provenance.
 * @returns The selected application binding expression, or undefined.
 */
export function applicationExpressionFor(
  descriptor: NormalizedDescriptor | undefined,
  bindings: ReadonlyMap<string, ImportBinding>,
  input: ManifestGenerationInput,
): string | undefined {
  return descriptor === undefined
    ? undefined
    : executableExpression(descriptor, "descriptor", bindings, input);
}

/**
 * Renders registry expressions for source-bound descriptors.
 * @param descriptors - Ordered normalized descriptors.
 * @param bindings - Source modules indexed by their deterministic import aliases.
 * @param input - Compiler input and source provenance.
 * @returns Descriptor IDs mapped to their source-bound registry expressions.
 */
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

export {
  transformExpressionsFor,
  middlewareExpressionsFor,
  hookExpressionsFor,
} from "./generate-manifest-handlers.js";
