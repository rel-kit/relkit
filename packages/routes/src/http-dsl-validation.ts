import { assertJsonValue, isStableId, type JsonValue } from "@zsys/contracts";
import type { StandardSchemaV1 } from "@zsys/schema";
import type {
  HttpMappingNode,
  HttpRequestMapping,
  HttpResponseMapping,
  MiddlewareDecisionMapping,
} from "./http-dsl-types.js";

export function isHttpMapping(value: unknown): value is HttpMappingNode {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  switch (value.kind) {
    case "path":
    case "path-segments":
    case "query":
    case "header":
    case "cookie":
    case "body":
    case "multipart":
    case "multipart-all":
      return (
        ownKeys(value, "kind", "name") && typeof value.name === "string" && value.name.length > 0
      );
    case "whole-body":
      return ownKeys(value, "kind");
    case "constant":
      return ownKeys(value, "kind", "value") && isJson(value.value);
    case "input":
    case "nested":
      return ownKeys(value, "kind", "fields") && isFields(value.fields);
    case "optional":
      return ownKeys(value, "kind", "value") && isMapping(value.value);
    case "default":
      return (
        ownKeys(value, "kind", "value", "default") &&
        isMapping(value.value) &&
        isJson(value.default)
      );
    case "transform":
      return (
        ownKeys(value, "kind", "transformId", "value") &&
        isStableId(value.transformId) &&
        isMapping(value.value)
      );
    default:
      return false;
  }
}
export function assertMapping(value: unknown): asserts value is HttpMappingNode {
  if (!isHttpMapping(value))
    throw new TypeError("HTTP mapping must be serializable and closure-free");
}
export function isHttpRequestMapping(value: unknown): value is HttpRequestMapping {
  return isHttpMapping(value) && value.kind === "input";
}
export function assertRequestMapping(value: unknown): asserts value is HttpRequestMapping {
  if (!isHttpRequestMapping(value))
    throw new TypeError("Route request must be a serializable HTTP input mapping");
}
export function isHttpResponseMapping(value: unknown): value is HttpResponseMapping {
  return (
    isRecord(value) &&
    ownKeys(value, "kind", "id", "status", "errorId", "schema") &&
    isStableId(value.id) &&
    isStatus(value.status) &&
    ["success", "error", "validation-error", "response"].includes(String(value.kind)) &&
    (value.errorId === undefined || isStableId(value.errorId)) &&
    (value.schema === undefined || isSchema(value.schema))
  );
}
export function assertResponse(value: unknown): HttpResponseMapping {
  if (!isHttpResponseMapping(value)) throw new TypeError("Invalid HTTP response mapping");
  return value;
}
export function isMiddlewareDecision(value: unknown): value is MiddlewareDecisionMapping {
  if (!isRecord(value)) return false;
  if (value.kind === "continue") return ownKeys(value, "kind");
  return (
    value.kind === "respond" &&
    ownKeys(value, "kind", "responseId", "body") &&
    isStableId(value.responseId) &&
    (value.body === undefined || isMapping(value.body))
  );
}
export function isSchema(value: unknown): value is StandardSchemaV1 {
  return (
    isRecord(value) &&
    isRecord(value["~standard"]) &&
    value["~standard"].version === 1 &&
    typeof value["~standard"].validate === "function"
  );
}
export function assertSchema(value: unknown, name: string): asserts value is StandardSchemaV1 {
  if (!isSchema(value)) throw new TypeError(`${name} must be a Standard Schema v1 validator`);
}
export function isStatus(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599;
}
function isMapping(value: unknown): value is HttpMappingNode {
  return isHttpMapping(value) && value.kind !== "input";
}
function isFields(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.getOwnPropertySymbols(value).length === 0 &&
    Object.entries(value).every(([name, mapping]) => name.length > 0 && isMapping(mapping))
  );
}
function isJson(value: unknown): value is JsonValue {
  try {
    assertJsonValue(value);
    return true;
  } catch {
    return false;
  }
}
function ownKeys(value: object, ...keys: string[]): boolean {
  return Reflect.ownKeys(value).every((key) => typeof key === "string" && keys.includes(key));
}
export function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
