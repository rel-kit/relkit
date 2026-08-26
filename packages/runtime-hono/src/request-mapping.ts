import { MISSING, type BodyIssueCode, type Missing } from "./request-mapping-body.js";
import { applyTransform } from "./request-mapping-transform.js";
import { readCookie, readHeader, readPathSegments, readScalar } from "./request-mapping-sources.js";
import { mapObject, type MappingState } from "./request-mapping-object.js";
import {
  addMappingIssue as add,
  bodyField,
  formField,
  jsonValue,
  mappingFailure as failure,
  validatedSource,
} from "./request-mapping-fields.js";

export type MappingValue = string | readonly string[];
export interface MappingRequest {
  readonly request: Request;
  readonly pathPattern?: string;
  readonly params: Readonly<Record<string, MappingValue>>;
  readonly query: Readonly<Record<string, MappingValue>>;
  readonly headers: Readonly<Record<string, MappingValue>>;
  readonly validated?: Readonly<Record<string, unknown>>;
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
  if (!isRecord(mapping) || mapping.kind !== "input") {
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
  if (!isRecord(node) || typeof node.kind !== "string") {
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
      if (node.kind === "path") {
        const value = validatedSource(state, "param", name);
        return value.found
          ? value.value
          : readScalar(state.request.params[name], "path", path, add.bind(null, state));
      }
      if (node.kind === "path-segments") {
        const value = validatedSource(state, "param", name);
        if (value.found) return value.value;
        return readPathSegments(
          state.request.request.url,
          state.request.pathPattern,
          name,
          path,
          add.bind(null, state),
        );
      }
      if (node.kind === "query") {
        const value = validatedSource(state, "query", name);
        return value.found
          ? value.value
          : readScalar(state.request.query[name], "query", path, add.bind(null, state));
      }
      if (node.kind === "header") {
        const value = validatedSource(state, "header", name);
        if (value.found) return value.value;
        return readScalar(
          readHeader(state.request.headers, name),
          "header",
          path,
          add.bind(null, state),
        );
      }
      if (node.kind === "cookie") {
        const value = validatedSource(state, "cookie", name);
        return value.found
          ? value.value
          : readCookie(name, state.request.headers, path, add.bind(null, state));
      }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
