/**
 * Documents each endpoint's real query contract. Better Auth's generator only reads
 * a top-level object schema and never marks a query field required, so wrapped
 * (`optional`, `default`) and union schemas publish no parameters at all.
 */
import type { JsonValue } from "@relkit/contracts";

/** The native endpoint fields this projection reads. */
export interface QueryEndpoint {
  readonly path?: string;
  readonly options?: {
    readonly method?: string | readonly string[];
    readonly query?: unknown;
    readonly metadata?: object;
  };
}

type JsonObject = { [key: string]: JsonValue };

const OPERATIONS = ["get", "delete", "post", "put", "patch"];

/**
 * Adds missing query parameters and required flags to Better Auth's generated paths.
 * @param document - Native generated document, before mounting under the base path.
 * @param endpoints - Native endpoints from the activated SDK, including plugins.
 * @returns A copy whose query parameters match each endpoint's input schema.
 * @remarks A union lists every field once; its branches are described on the operation.
 * Endpoints with explicit `metadata.openapi.parameters` keep their authored parameters.
 */
export function documentQueryParameters(
  document: JsonValue,
  endpoints: Iterable<QueryEndpoint>,
): JsonValue {
  if (!isRecord(document) || !isRecord(document.paths)) return document;
  const paths: JsonObject = { ...document.paths };
  for (const endpoint of endpoints) {
    const options = endpoint.options;
    if (endpoint.path === undefined || options?.query === undefined) continue;
    const metadata = options.metadata as { SERVER_ONLY?: boolean; openapi?: object } | undefined;
    if (metadata?.SERVER_ONLY || (metadata?.openapi && "parameters" in metadata.openapi)) continue;
    const query = queryContract(options.query);
    if (query === undefined) continue;
    const path = endpoint.path.replace(/:([^/]+)/g, "{$1}");
    const item = paths[path];
    if (!isRecord(item)) continue;
    // Endpoints sharing a path differ by method; each documents only its own operations.
    const methods = [options.method ?? "*"].flat().map((method) => method.toLowerCase());
    paths[path] = Object.fromEntries(
      Object.entries(item).map(([method, operation]) =>
        OPERATIONS.includes(method) &&
        (methods.includes("*") || methods.includes(method)) &&
        isRecord(operation)
          ? [method, withQuery(operation, query)]
          : [method, operation],
      ),
    );
  }
  return { ...document, paths };
}

interface QueryContract {
  readonly parameters: readonly JsonObject[];
  readonly alternatives?: string;
}

/**
 * Lists the object shapes a union schema accepts, marking optional fields with `?`.
 * @param schema - A Standard JSON Schema validator, such as an endpoint's query schema.
 * @returns For example `accountId, userId? | useAccountCookie, userId?`; undefined for a single shape.
 */
export function acceptedShapes(schema: unknown): string | undefined {
  const branches = objectBranches(schema);
  if (branches.length < 2) return undefined;
  return branches
    .map((branch) =>
      Object.keys(branch.properties as JsonObject)
        .map((name) => (requiredFields(branch).includes(name) ? name : `${name}?`))
        .join(", "),
    )
    .join(" | ");
}

function objectBranches(schema: unknown): JsonObject[] {
  const json = inputJsonSchema(schema);
  if (!isRecord(json)) return [];
  const union = json.anyOf ?? json.oneOf;
  return (Array.isArray(union) ? union : [json]).filter(
    (branch): branch is JsonObject => isRecord(branch) && isRecord(branch.properties),
  );
}

/** Reads the input JSON Schema a Standard JSON Schema validator publishes. */
function queryContract(schema: unknown): QueryContract | undefined {
  const branches = objectBranches(schema);
  if (branches.length === 0) return undefined;
  const names = [
    ...new Set(branches.flatMap((branch) => Object.keys(branch.properties as JsonObject))),
  ];
  // A query the endpoint accepts when omitted (an optional object) requires none of its fields.
  const omittable = acceptsMissing(schema);
  const parameters = names.map((name) => {
    const owner = branches.find((branch) => Object.hasOwn(branch.properties as JsonObject, name))!;
    const { description, ...schema } = (owner.properties as JsonObject)[name] as JsonObject;
    return {
      name,
      in: "query",
      ...(!omittable && branches.every((branch) => requiredFields(branch).includes(name))
        ? { required: true }
        : {}),
      ...(typeof description === "string" ? { description } : {}),
      schema,
    };
  });
  const shapes = acceptedShapes(schema);
  return {
    parameters,
    ...(shapes === undefined ? {} : { alternatives: `Query accepts one of: ${shapes}.` }),
  };
}

/** Merges derived query parameters, keeping path and header parameters as generated. */
function withQuery(operation: JsonObject, query: QueryContract): JsonObject {
  const existing = Array.isArray(operation.parameters) ? operation.parameters : [];
  const others = existing.filter((parameter) => !isRecord(parameter) || parameter.in !== "query");
  const description =
    query.alternatives === undefined
      ? operation.description
      : [operation.description, query.alternatives]
          .filter((part) => typeof part === "string")
          .join("\n\n");
  return {
    ...operation,
    ...(description === undefined ? {} : { description }),
    parameters: [...others, ...query.parameters],
  };
}

function inputJsonSchema(schema: unknown): JsonValue | undefined {
  const standard = isObject(schema) ? schema["~standard"] : undefined;
  const jsonSchema = isObject(standard) ? standard.jsonSchema : undefined;
  const input = isObject(jsonSchema) ? jsonSchema.input : undefined;
  if (typeof input !== "function") return undefined;
  try {
    return input({ target: "openapi-3.0" }) as JsonValue;
  } catch {
    return undefined;
  }
}

/** Whether the schema synchronously accepts an absent query; async validators count as no. */
function acceptsMissing(schema: unknown): boolean {
  const standard = isObject(schema) ? schema["~standard"] : undefined;
  const validate = isObject(standard) ? standard.validate : undefined;
  if (typeof validate !== "function") return false;
  try {
    const result: unknown = validate(undefined);
    return isObject(result) && !("then" in result) && result.issues === undefined;
  } catch {
    return false;
  }
}

function requiredFields(branch: JsonObject): readonly JsonValue[] {
  return Array.isArray(branch.required) ? branch.required : [];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return (typeof value === "object" || typeof value === "function") && value !== null;
}

function isRecord(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
