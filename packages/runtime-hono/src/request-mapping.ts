import {
  MISSING,
  parseForm,
  parseJson,
  type BodyIssueCode,
  type Missing,
} from "./request-mapping-body.js";
import { applyTransform } from "./request-mapping-transform.js";
import { readCookie, readHeader, readPathSegments, readScalar } from "./request-mapping-sources.js";
import { mapObject, type MappingState } from "./request-mapping-object.js";

export type MappingValue = string | readonly string[];
export interface MappingRequest {
  readonly request: Request;
  readonly pathPattern?: string;
  readonly params: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, MappingValue>>;
  readonly headers: Readonly<Record<string, MappingValue>>;
}
export type RequestIssueCode = "missing" | "duplicate" | "transform" | "mapping" | BodyIssueCode;
export interface RequestMappingIssue {
  readonly code: RequestIssueCode;
  readonly message: string;
  readonly path: readonly (string | number)[];
}
export interface RequestMappingSuccess {
  readonly ok: true;
  readonly value: unknown;
}
export interface RequestMappingFailure {
  readonly ok: false;
  readonly issues: readonly RequestMappingIssue[];
}
export type RequestMappingResult = RequestMappingSuccess | RequestMappingFailure;
export interface RequestMappingOptions {
  readonly transforms?: Readonly<Record<string, unknown>> | ReadonlyMap<string, unknown>;
  readonly maxBodyBytes?: number;
}
export const DEFAULT_MAX_BODY_BYTES = 1_048_576;

export function isRequestMappingFailure(value: unknown): value is RequestMappingFailure {
  return isRecord(value) && value.ok === false && Array.isArray(value.issues);
}

export async function mapRequest(
  request: MappingRequest,
  mapping: unknown,
  options: RequestMappingOptions = {},
): Promise<RequestMappingResult> {
  const state: MappingState = {
    request,
    body: {
      // Bun and Undici expose equivalent Fetch requests with incompatible declarations.
      request: request.request.bodyUsed
        ? request.request
        : (request.request.clone() as unknown as Request),
      maxBodyBytes: options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
    },
    options,
    issues: [],
    reported: new Set(),
  };
  if (!isNode(mapping) || mapping.kind !== "input") {
    add(state, "mapping", "Request mapping must be an input node", []);
    return failure(state);
  }
  const value = await visit(mapping, state, []);
  if (value === MISSING) add(state, "mapping", "Request mapping produced no input", []);
  return state.issues.length === 0 ? { ok: true, value } : failure(state);
}

async function visit(
  node: unknown,
  state: MappingState,
  path: readonly (string | number)[],
): Promise<unknown | Missing> {
  if (!isNode(node) || typeof node.kind !== "string") {
    add(state, "mapping", "Invalid serialized request mapping", path);
    return MISSING;
  }
  switch (node.kind) {
    case "input":
    case "nested":
      return mapObject(node.fields, state, path, visit, add.bind(null, state));
    case "path":
    case "path-segments":
    case "query":
    case "header":
    case "cookie":
    case "body":
    case "multipart":
    case "multipart-all": {
      const name = typeof node.name === "string" ? node.name : undefined;
      if (name === undefined) {
        add(state, "mapping", `Mapping node "${node.kind}" needs a name`, path);
        return MISSING;
      }
      if (node.kind === "path")
        return readScalar(state.request.params[name], "path", path, add.bind(null, state));
      if (node.kind === "path-segments")
        return readPathSegments(
          state.request.request.url,
          state.request.pathPattern,
          name,
          path,
          add.bind(null, state),
        );
      if (node.kind === "query")
        return readScalar(state.request.query[name], "query", path, add.bind(null, state));
      if (node.kind === "header")
        return readScalar(
          readHeader(state.request.headers, name),
          "header",
          path,
          add.bind(null, state),
        );
      if (node.kind === "cookie")
        return readCookie(name, state.request.headers, path, add.bind(null, state));
      if (node.kind === "body") return bodyField(name, state, path);
      return formField(name, state, path, node.kind === "multipart-all");
    }
    case "whole-body":
      return jsonValue(state, path);
    case "constant":
      return node.value;
    case "optional": {
      const value = await visit(node.value, state, path);
      return value === MISSING ? undefined : value;
    }
    case "default": {
      const value = await visit(node.value, state, path);
      return value === MISSING ? node.default : value;
    }
    case "transform":
      return applyTransform(
        node.transformId,
        await visit(node.value, state, path),
        state.options.transforms,
        path,
        (message, issuePath) => add(state, "transform", message, issuePath),
      );
    default:
      add(state, "mapping", `Unsupported mapping node "${node.kind}"`, path);
      return MISSING;
  }
}

async function bodyField(
  name: string,
  state: MappingState,
  path: readonly (string | number)[],
): Promise<unknown | Missing> {
  const value = await jsonValue(state, path);
  return value !== MISSING && isNode(value) && Object.prototype.hasOwnProperty.call(value, name)
    ? value[name]
    : MISSING;
}

async function jsonValue(
  state: MappingState,
  path: readonly (string | number)[],
): Promise<unknown | Missing> {
  const result = await parseJson(state.body);
  if (result.issue !== undefined) add(state, result.issue.code, result.issue.message, path);
  return result.value;
}

async function formField(
  name: string,
  state: MappingState,
  path: readonly (string | number)[],
  all: boolean,
): Promise<unknown | Missing> {
  const result = await parseForm(state.body);
  if (result.issue !== undefined) add(state, result.issue.code, result.issue.message, path);
  if (result.value === MISSING) return MISSING;
  const values = result.value.getAll(name);
  if (all) return values.length === 0 ? MISSING : Object.freeze([...values]);
  if (values.length > 1) add(state, "duplicate", `Duplicate multipart field "${name}"`, path);
  return values.length === 1 ? values[0] : MISSING;
}

function failure(state: MappingState): RequestMappingFailure {
  return { ok: false, issues: Object.freeze(state.issues.map((item) => Object.freeze(item))) };
}
function add(
  state: MappingState,
  code: RequestIssueCode,
  message: string,
  path: readonly (string | number)[],
): void {
  const key = `${code}:${path.join(".")}:${message}`;
  if (state.reported.has(key)) return;
  state.reported.add(key);
  state.issues.push(Object.freeze({ code, message, path: Object.freeze([...path]) }));
}
function isNode(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
