import { schema, schemaProperties } from "./normalize-compat.js";
import { add } from "./normalize-pass-utils.js";
import { isErrorDescriptorLike, isRecord } from "./normalize-utils.js";
import {
  NORMALIZE_CODES,
  type NormalizedDescriptor,
  type NormalizationWork,
} from "./normalize-types.js";

const QUERY_METHODS = new Set(["GET", "HEAD", "DELETE", "OPTIONS"]);

/** Infers the routine route mapping from the target's runtime schemas. */
export function inferRouteContract(
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
  value: Record<string, any>,
): void {
  const target = isRecord(value.target) ? value.target : {};
  if (value.request === undefined) value.request = inferRequest(work, descriptor, value, target);
  if (value.responses === undefined) value.responses = inferResponses(value, target);
}

function inferRequest(
  work: NormalizationWork,
  descriptor: NormalizedDescriptor,
  route: Record<string, any>,
  target: Record<string, any>,
): Record<string, unknown> {
  const projection = schemaProperties(target.input);
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
        `Path segment "${parameter.name}" is missing from the target input schema.`,
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
    const source = { kind: body ? "body" : "query", name };
    const defaultValue = schemaDefault(projection.properties[name]);
    fields[name] =
      defaultValue === undefined
        ? required.has(name)
          ? source
          : { kind: "optional", value: source }
        : { kind: "default", value: source, default: defaultValue };
  }
  return { kind: "input", fields };
}

function inferResponses(
  route: Record<string, any>,
  target: Record<string, any>,
): readonly Record<string, unknown>[] {
  const output = schema(target.output);
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
}

interface PathParameter {
  readonly name: string;
  readonly catchAll: boolean;
  readonly optional: boolean;
}

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

function allowsArray(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.type === "array") return true;
  return [value.anyOf, value.oneOf].some(
    (variants) => Array.isArray(variants) && variants.some(allowsArray),
  );
}

function schemaDefault(value: unknown): unknown {
  return isRecord(value) && "default" in value ? value.default : undefined;
}

function isVoidSchema(value: unknown): boolean {
  return isRecord(value) && value["x-zsys-void"] === true;
}
