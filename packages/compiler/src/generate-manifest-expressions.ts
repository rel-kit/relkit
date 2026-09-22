import type { Diagnostic } from "@relkit/diagnostics";
import type { ManifestGenerationInput } from "./generate-manifest.js";
import { isRecord, missingReference, type ImportBinding } from "./generate-manifest-utils.js";
import type { NormalizedDescriptor } from "./normalize-types.js";
import { functionEventTargetExpression } from "./generate-manifest-event.js";
import {
  executableExpression,
  isGeneratedFunction,
  isExecutableProperty,
  isExecutableSchema,
} from "./generate-manifest-expression-support.js";

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
