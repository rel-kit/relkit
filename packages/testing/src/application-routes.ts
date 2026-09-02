import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  compareRouteFilePaths,
  parseRouteFilePath,
  type ParsedRouteFilePath,
} from "@relkit/compiler";
import { getJsonSchema, type StandardSchemaV1 } from "@relkit/schema";
import type { TestRuntime } from "./runtime.js";

const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "ALL"] as const;
const queryMethods = new Set(["GET", "HEAD", "DELETE", "OPTIONS"]);

export type TestFunctionRoute = {
  readonly method: string;
  readonly path: string;
  readonly request: unknown;
  readonly target: Parameters<TestRuntime["invoke"]>[0] & {
    readonly input: StandardSchemaV1;
    readonly output: StandardSchemaV1;
    readonly errors?: readonly {
      readonly id: string;
      readonly data: StandardSchemaV1;
      readonly http?: { readonly status: number };
    }[];
  };
  readonly responses: readonly {
    readonly kind?: string;
    readonly id?: string;
    readonly status?: number;
    readonly errorId?: string;
  }[];
};

export type TestRawRoute = {
  readonly method: "ALL";
  readonly path: string;
  readonly handler: (request: Request) => Response | Promise<Response>;
  readonly auth?: { readonly protected: readonly string[] };
};

export type TestRoute = TestFunctionRoute | TestRawRoute;
type AuthoredRoute = Omit<TestFunctionRoute, "method" | "path" | "request" | "responses"> & {
  readonly accept?: "application/json" | "multipart/form-data";
  readonly request?: unknown;
  readonly responses?: TestFunctionRoute["responses"];
  readonly successStatus?: number;
};

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

function schemaDefault(value: unknown): unknown {
  return isRecord(value) && "default" in value ? value.default : undefined;
}

function allowsArray(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.type === "array") return true;
  return [value.anyOf, value.oneOf].some(
    (variants) => Array.isArray(variants) && variants.some(allowsArray),
  );
}

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

function isRoute(value: unknown): value is AuthoredRoute {
  return (
    isRecord(value) &&
    isRecord(value.target) &&
    typeof value.target.handler === "function" &&
    isSchema(value.target.input) &&
    isSchema(value.target.output)
  );
}

function isRawRoute(
  value: unknown,
): value is { readonly handler: TestRawRoute["handler"]; readonly auth?: TestRawRoute["auth"] } {
  return isRecord(value) && value.raw === true && typeof value.handler === "function";
}

function isSchema(value: unknown): value is StandardSchemaV1 {
  return isRecord(value) && isRecord(value["~standard"]);
}
function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRecordLike(value: unknown): value is Record<string, any> {
  return value !== null && (typeof value === "object" || typeof value === "function");
}
