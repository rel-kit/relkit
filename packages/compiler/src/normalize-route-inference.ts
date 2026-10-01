import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import { observeCompiler } from "./observability.js";
import type { PathParameter } from "./normalize-route-inference.types.js";
import { schemaPropertiesEffect, schemaEffect } from "./normalize-compat.js";
import { add } from "./normalize-pass-utils.js";
import { isErrorDescriptorLike, isRecord } from "./normalize-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";

const QUERY_METHODS = new Set(["GET", "HEAD", "DELETE", "OPTIONS"]);

/**
 * Derives route schemas and response mappings from the target function.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @param descriptor - Descriptor whose contract is checked.
 * @param value - Declared metadata to inspect without coercion.
 * @returns A lazy effect yielding the checked result; findings append to the workspace diagnostics.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export const inferRouteContractEffect = Effect.fn("Compiler.inferRouteContract")(
  function* (
    work: NormalizationWork,
    descriptor: NormalizedDescriptor,
    value: Record<string, any>,
  ) {
    if (value.raw === true) return;
    const target = isRecord(value.target) ? value.target : {};
    if (value.request === undefined)
      value.request = yield* inferRequestEffect(work, descriptor, value, target);
    if (value.responses === undefined) value.responses = yield* inferResponsesEffect(value, target);
  },
  (effect, work, descriptor, value) =>
    observeCompiler("normalization", "inferRouteContract", effect, () => ({
      descriptors: work.descriptors.length,
      diagnostics: work.diagnostics.length,
    })),
);

/**
 * Derives route schemas and response mappings from the target function.
 * @param work - Invocation-owned descriptors, indexes, and diagnostics.
 * @param descriptor - Descriptor whose contract is checked.
 * @param value - Declared metadata to inspect without coercion.
 * @returns The checked result after executing the Effect at the compatibility boundary.
 * @remarks Unexpected metadata access failures remain defects.
 * @see {@link normalizeCompilationEffect} for ordered stage composition.
 */
export function inferRouteContract(
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
  value: Record<string, any>,
): void {
  return runCompilerSync(inferRouteContractEffect(work, descriptor, value));
}

/**
 * Derives request field mappings from target schema and route parameters.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @param route - Route descriptor being checked or projected.
 * @param target - Target contract or metadata being checked.
 * @returns A lazy effect that derives request field mappings from target schema and route parameters; unexpected access failures remain defects.
 */
const inferRequestEffect = Effect.fn("Compiler.inferRequest")(function* (
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
  route: Record<string, any>,
  target: Record<string, any>,
) {
  const projection = yield* schemaPropertiesEffect(target.input);
  if (projection === undefined) {
    add(
      work,
      descriptor,
      NORMALIZE_CODES.mapping,
      "Route request inference needs an object input schema; add an explicit request mapping.",
    );
    return { kind: "input", fields: {} };
  }
  const fields: Record<string, unknown> = {};
  const parameters = pathParameters(String(route.path ?? ""));
  for (const parameter of parameters) {
    const property = projection.properties[parameter.name];
    if (property === undefined) {
      add(
        work,
        descriptor,
        NORMALIZE_CODES.mapping,
        `Inferred path parameter "${parameter.name}" is missing from the target function input schema. Add the field or define an explicit request mapping.`,
      );
      continue;
    }
    if (parameter.catchAll && !allowsArray(property)) {
      add(
        work,
        descriptor,
        NORMALIZE_CODES.mapping,
        `Catch-all path segment "${parameter.name}" must use an array schema.`,
      );
    }
    const source = {
      kind: parameter.catchAll ? "path-segments" : "path",
      name: parameter.name,
    };
    fields[parameter.name] = parameter.optional ? { kind: "optional", value: source } : source;
  }
  const required = new Set(projection.required);
  const body = !QUERY_METHODS.has(String(route.method));
  for (const name of Object.keys(projection.properties).sort()) {
    if (fields[name] !== undefined) continue;
    const property = projection.properties[name];
    const source = body ? bodySource(route.accept, name, property) : { kind: "query", name };
    const defaultValue = schemaDefault(property);
    fields[name] =
      defaultValue === undefined
        ? required.has(name)
          ? source
          : { kind: "optional", value: source }
        : { kind: "default", value: source, default: defaultValue };
  }
  return { kind: "input", fields };
});

/**
 * Selects body or multipart mapping syntax for one input property.
 * @param accept - HTTP request content type.
 * @param name - Declared binding or parameter name.
 * @param property - Declared property to inspect.
 * @returns The selected body or multipart mapping source and field name.
 */
function bodySource(
  accept: unknown,
  name: string,
  property: unknown,
): { readonly kind: "body" | "multipart" | "multipart-all"; readonly name: string } {
  if (accept !== "multipart/form-data") return { kind: "body", name };
  return { kind: allowsArray(property) ? "multipart-all" : "multipart", name };
}

/**
 * Derives success, error, validation, and rate-limit responses.
 * @param route - Route descriptor being checked or projected.
 * @param target - Target contract or metadata being checked.
 * @returns A lazy effect that derives success, error, validation, and rate-limit responses; unexpected access failures remain defects.
 */
const inferResponsesEffect = Effect.fn("Compiler.inferResponses")(function* (
  route: Record<string, any>,
  target: Record<string, any>,
) {
  const output = yield* schemaEffect(target.output);
  const status = route.successStatus ?? (isVoidSchema(output.schema) ? 204 : 200);
  const responses: Record<string, unknown>[] = [
    {
      kind: "success",
      id: `success.${status}`,
      status,
      ...(status === 204 || isVoidSchema(output.schema) ? {} : { schema: target.output }),
    },
  ];
  for (const error of Array.isArray(target.errors) ? target.errors : []) {
    if (!isErrorDescriptorLike(error)) continue;
    const status =
      isRecord(error.http) && typeof error.http.status === "number" ? error.http.status : 500;
    responses.push({
      kind: "error",
      id: `error.${String(error.id)}.${status}`,
      status,
      errorId: error.id,
      ...(error.data === undefined ? {} : { schema: error.data }),
    });
  }
  responses.push({ kind: "validation-error", id: "validation.422", status: 422 });
  if (route.rateLimit !== undefined) {
    responses.push({ kind: "response", id: "rate-limit.429", status: 429 });
  }
  return responses;
});

/**
 * Reads named and catch-all parameters from a canonical route path.
 * @param path - Portable source, property, or runtime path.
 * @returns Named and catch-all parameters from the canonical HTTP path.
 */
function pathParameters(path: string): readonly PathParameter[] {
  const result: PathParameter[] = [];
  for (const segment of path.split("/")) {
    if (segment.startsWith(":")) {
      result.push({ name: segment.slice(1), catchAll: false, optional: false });
    }
    if (segment.startsWith("*")) {
      result.push({
        name: segment.slice(1).replace(/\?$/, ""),
        catchAll: true,
        optional: segment.endsWith("?"),
      });
    }
  }
  return result;
}

/**
 * Checks direct and union JSON Schema array projections.
 * @param value - Declared metadata inspected without coercion.
 * @returns True when the schema accepts an array-valued route parameter.
 */
function allowsArray(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.type === "array") return true;
  return [value.anyOf, value.oneOf].some(
    (variants) => Array.isArray(variants) && variants.some(allowsArray),
  );
}

/**
 * Reads an explicitly declared JSON Schema default.
 * @param value - Declared metadata inspected without coercion.
 * @returns The explicitly declared schema default, including falsy values.
 */
function schemaDefault(value: unknown): unknown {
  return isRecord(value) && "default" in value ? value.default : undefined;
}

/**
 * Recognizes a JSON Schema marker for a void output.
 * @param value - Declared metadata inspected without coercion.
 * @returns True when the schema describes an absent response value.
 */
function isVoidSchema(value: unknown): boolean {
  return isRecord(value) && value["x-relkit-void"] === true;
}
