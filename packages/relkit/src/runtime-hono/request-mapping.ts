import { Context, Effect, Layer } from "effect";
import { httpBoundary, observeHttp, runHttp } from "./http-effect.js";
import { MISSING } from "./request-mapping-body.js";
import {
  addMappingIssue as add,
  bodyField,
  mappingFailure as failure,
  formField,
  jsonValue,
  validatedSource,
} from "./request-mapping-fields.js";
import { mapObjectEffect, type MappingState } from "./request-mapping-object.js";
import type { EffectVisit } from "./request-mapping-object.types.js";
import { readCookie, readHeader, readPathSegments, readScalar } from "./request-mapping-sources.js";
import { applyTransform } from "./request-mapping-transform.js";
import type {
  MappingRequest,
  RequestMappingFailure,
  RequestMappingOptions,
  RequestMappingResult,
} from "./request-mapping.types.js";
export type {
  MappingRequest,
  MappingValue,
  RequestIssueCode,
  RequestMappingFailure,
  RequestMappingIssue,
  RequestMappingOptions,
  RequestMappingResult,
  RequestMappingSuccess,
} from "./request-mapping.types.js";
export const DEFAULT_MAX_BODY_BYTES = 1_048_576;

/** Recognizes the public request-mapping failure envelope.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns Whether the value is a public mapping-failure envelope.
 */
export function isRequestMappingFailure(value: unknown): value is RequestMappingFailure {
  return isRecord(value) && value.ok === false && Array.isArray(value.issues);
}

/** Evaluates declared mapping fields sequentially with one bounded body state.
 * @param request - Native request whose headers, body and cancellation signal define this operation.
 * @param mapping - mapping supplied by the caller.
 * @param options - Application dependencies and configuration for this domain.
 * @returns An effect yielding the mapped input or an immutable envelope of accumulated mapping issues.
 */
const mapRequestEffect = Effect.fn("RequestMapping.map")(function* (
  request: MappingRequest,
  mapping: unknown,
  options: RequestMappingOptions = {},
) {
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
  const value = yield* visit(mapping, state, []);
  if (value === MISSING) add(state, "mapping", "Request mapping produced no input", []);
  return state.issues.length === 0 ? { ok: true as const, value } : failure(state);
});

/** Evaluate one serialized mapping node with shared bounded body and issue state.
 * @param node - Declarative field, nested object, default or transform node.
 * @param state - Request sources, cached body parsing and accumulated issues.
 * @param path - Output field path attached to any mapping issue.
 * @returns The mapped value or missing sentinel, recording unsupported input in state.
 */
const visit: EffectVisit = Effect.fn("RequestMapping.visit")(function* (
  node: unknown,
  state: MappingState,
  path: readonly (string | number)[],
) {
  if (!isRecord(node) || typeof node.kind !== "string") {
    add(state, "mapping", "Invalid serialized request mapping", path);
    return MISSING;
  }
  switch (node.kind) {
    case "input":
    case "nested":
      return yield* mapObjectEffect(node.fields, state, path, visit, add.bind(null, state));
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
      if (node.kind === "body")
        return yield* httpBoundary("request.mapping.body", () => bodyField(name, state, path));
      return yield* httpBoundary("request.mapping.form", () =>
        formField(name, state, path, node.kind === "multipart-all"),
      );
    }
    case "whole-body":
      return yield* httpBoundary("request.mapping.json", () => jsonValue(state, path));
    case "constant":
      return node.value;
    case "optional": {
      const value = yield* visit(node.value, state, path);
      return value === MISSING ? undefined : value;
    }
    case "default": {
      const value = yield* visit(node.value, state, path);
      return value === MISSING ? node.default : value;
    }
    case "transform": {
      const value = yield* visit(node.value, state, path);
      return yield* httpBoundary("request.mapping.transform", () =>
        applyTransform(
          node.transformId,
          value,
          state.options.transforms,
          path,
          (message, issuePath) => add(state, "transform", message, issuePath),
        ),
      );
    }
    default:
      add(state, "mapping", `Unsupported mapping node "${node.kind}"`, path);
      return MISSING;
  }
});

/** Materializes a declarative request mapping with shared bounded body state. */
export class RequestMapping extends Context.Service<
  RequestMapping,
  { readonly map: typeof mapRequestEffect }
>()("@relkit/runtime-hono/RequestMapping") {}

/** Live request mapping preserves sequential field order and accumulated issues. */
export const RequestMappingLive = Layer.succeed(RequestMapping, {
  map: (...args) => observeHttp("request.mapping", mapRequestEffect(...args)),
});

/** Native route compatibility edge for lazy request mapping.
 * @param request - Native request whose headers, body and cancellation signal define this operation.
 * @param mapping - mapping supplied by the caller.
 * @param options - Application dependencies and configuration for this domain.
 * @returns The successful mapped value or the existing accumulated issue envelope.
 */
export function mapRequest(
  request: MappingRequest,
  mapping: unknown,
  options: RequestMappingOptions = {},
): Promise<RequestMappingResult> {
  return runHttp(
    Effect.flatMap(RequestMapping, (service) => service.map(request, mapping, options)).pipe(
      Effect.provide(RequestMappingLive),
    ),
    request.request.signal,
  );
}

/** Recognizes a non-null object before reading its named properties.
 * @param value - Value inspected, validated or projected by this operation.
 * @returns Whether the inspected value satisfies the declared type guard.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
