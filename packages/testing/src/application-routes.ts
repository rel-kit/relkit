import type {
  TestFunctionRoute,
  TestRawRoute,
  TestRoute,
  AuthoredRoute,
} from "./application-routes.types.js";
export type { TestFunctionRoute, TestRawRoute, TestRoute } from "./application-routes.types.js";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  compareRouteFilePaths,
  parseRouteFilePath,
  type ParsedRouteFilePath,
} from "@relkit/compiler";
import { getJsonSchema, type StandardSchemaV1 } from "@relkit/schema";

const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "ALL"] as const;

const queryMethods = new Set(["GET", "HEAD", "DELETE", "OPTIONS"]);

/**
 * Loads filesystem routes and derives native request/response contracts.
 * @param root - Explicit source project or persistence root.
 * @returns Routes in deterministic source order without activating service handlers.
 */
export async function loadTestRoutes(root: string): Promise<readonly TestRoute[]> {
  const directory = join(root, "src", "routes");
  const files = [...new Bun.Glob("**/route.ts").scanSync({ cwd: directory, onlyFiles: true })];
  const loaded: { route: TestRoute; parsed: ParsedRouteFilePath }[] = [];
  for (const file of files.sort()) {
    const sourcePath = `src/routes/${file.replaceAll("\\", "/")}`;
    const parsed = parseRouteFilePath(sourcePath);
    const module = (await import(pathToFileURL(join(directory, file)).href)) as Readonly<
      Record<string, unknown>
    >;
    for (const method of methods) {
      const route = module[method];
      if (method === "ALL" && isRawRoute(route)) {
        loaded.push({ route: normalizeRawRoute(route, parsed), parsed });
      } else if (isRoute(route)) {
        loaded.push({ route: normalizeRoute(route, method, parsed), parsed });
      }
    }
  }
  loaded.sort(
    (left, right) =>
      compareRouteFilePaths(left.parsed, right.parsed) ||
      left.route.method.localeCompare(right.route.method),
  );
  if (loaded.length === 0) throw new Error("No test routes were found in src/routes/**/route.ts.");
  return Object.freeze(loaded.map(({ route }) => route));
}

/**
 * Binds parsed filesystem metadata to a native raw route.
 * @param route - Authored route descriptor with parsed native metadata.
 * @param parsed - Parsed filesystem route metadata.
 * @returns A route retaining its handler and authentication registration.
 */
function normalizeRawRoute(
  route: { readonly handler: TestRawRoute["handler"]; readonly auth?: TestRawRoute["auth"] },
  parsed: ParsedRouteFilePath,
): TestRawRoute {
  return Object.freeze({
    method: "ALL",
    path: parsed.canonicalPath,
    handler: route.handler,
    ...(route.auth === undefined ? {} : { auth: route.auth }),
  });
}

/**
 * Derives the native function route mapping and response policy.
 * @param route - Authored route descriptor with parsed native metadata.
 * @param method - Authored HTTP method.
 * @param parsed - Parsed filesystem route metadata.
 * @returns A function route using the existing schema authority.
 */
function normalizeRoute(
  route: AuthoredRoute,
  method: string,
  parsed: ParsedRouteFilePath,
): TestFunctionRoute {
  return Object.freeze({
    method,
    path: parsed.canonicalPath,
    target: route.target,
    request: route.request ?? inferRequest(route, method, parsed),
    responses: route.responses ?? inferResponses(route),
  });
}

/**
 * Derives request field mappings from the authored route schema.
 * @param route - Authored route descriptor with parsed native metadata.
 * @param method - Authored HTTP method.
 * @param parsed - Parsed filesystem route metadata.
 * @returns The native mapping preserving declared query/body defaults.
 */
function inferRequest(
  route: AuthoredRoute,
  method: string,
  parsed: ParsedRouteFilePath,
): Record<string, unknown> {
  const projection = getJsonSchema(route.target.input);
  const schema = projection.ok ? projection.schema : undefined;
  const properties = isRecord(schema?.properties)
    ? (schema.properties as Readonly<Record<string, unknown>>)
    : undefined;
  if (schema?.type !== "object" || properties === undefined)
    throw new TypeError(
      `Route ${method} ${parsed.canonicalPath} needs an explicit request mapping.`,
    );
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const fields: Record<string, unknown> = {};
  for (const parameter of parsed.parameters) {
    if (!(parameter.name in properties))
      throw new TypeError(`Path segment "${parameter.name}" is missing from the target input.`);
    const source = {
      kind: parameter.kind === "dynamic" ? "path" : "path-segments",
      name: parameter.name,
    };
    fields[parameter.name] =
      parameter.kind === "optional-catch-all" ? { kind: "optional", value: source } : source;
  }
  for (const name of Object.keys(properties).sort()) {
    if (name in fields) continue;
    const source = queryMethods.has(method)
      ? { kind: "query", name }
      : route.accept === "multipart/form-data"
        ? { kind: allowsArray(properties[name]) ? "multipart-all" : "multipart", name }
        : { kind: "body", name };
    const defaultValue = schemaDefault(properties[name]);
    fields[name] =
      defaultValue === undefined
        ? required.has(name)
          ? source
          : { kind: "optional", value: source }
        : { kind: "default", value: source, default: defaultValue };
  }
  return { kind: "input", fields };
}

/**
 * Reads the authored schema's existing default without inventing one.
 * @param value - Candidate native value checked or detached by this helper.
 * @returns The declared default, or undefined.
 */
function schemaDefault(value: unknown): unknown {
  return isRecord(value) && "default" in value ? value.default : undefined;
}

/**
 * Checks whether the existing authored schema accepts array inputs.
 * @param value - Candidate native value checked or detached by this helper.
 * @returns True when native schema metadata permits an array.
 */
function allowsArray(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.type === "array") return true;
  return [value.anyOf, value.oneOf].some(
    (variants) => Array.isArray(variants) && variants.some(allowsArray),
  );
}

/**
 * Derives HTTP response statuses from declared function error metadata.
 * @param route - Authored route descriptor with parsed native metadata.
 * @returns The existing output/error status mapping.
 */
function inferResponses(route: AuthoredRoute): TestFunctionRoute["responses"] {
  const projection = getJsonSchema(route.target.output);
  const noContent = projection.ok && projection.schema["x-relkit-void"] === true;
  return [
    { kind: "success", status: route.successStatus ?? (noContent ? 204 : 200) },
    ...(route.target.errors ?? []).flatMap((error) => {
      if (!isRecordLike(error) || typeof error.id !== "string") return [];
      const http = (error as { readonly http?: unknown }).http;
      const status = isRecordLike(http) && typeof http.status === "number" ? http.status : 500;
      return [{ kind: "error", status, errorId: error.id }];
    }),
    { kind: "validation-error", status: 422 },
  ];
}

/**
 * Checks an imported value for the authored function route boundary.
 * @param value - Candidate native value checked or detached by this helper.
 * @returns True for a usable function route descriptor.
 */
function isRoute(value: unknown): value is AuthoredRoute {
  return (
    isRecord(value) &&
    isRecord(value.target) &&
    typeof value.target.handler === "function" &&
    isSchema(value.target.input) &&
    isSchema(value.target.output)
  );
}

/**
 * Checks an imported value for the authored raw route boundary.
 * @param value - Candidate native value checked or detached by this helper.
 * @returns True for a raw handler route descriptor.
 */
function isRawRoute(
  value: unknown,
): value is { readonly handler: TestRawRoute["handler"]; readonly auth?: TestRawRoute["auth"] } {
  return isRecord(value) && value.raw === true && typeof value.handler === "function";
}

/**
 * Checks Standard Schema metadata before deriving HTTP mappings.
 * @param value - Candidate native value checked or detached by this helper.
 * @returns True for a usable authored schema.
 */
function isSchema(value: unknown): value is StandardSchemaV1 {
  return isRecord(value) && isRecord(value["~standard"]);
}

/**
 * Checks the shallow non-array object shape before selective property access.
 * @param value - Candidate native value checked or detached by this helper.
 * @returns True for a non-null non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Checks object/function values used by schema metadata.
 * @param value - Candidate native value checked or detached by this helper.
 * @returns True when safe metadata selection can proceed.
 */
function isRecordLike(value: unknown): value is Record<string, unknown> {
  return value !== null && (typeof value === "object" || typeof value === "function");
}
