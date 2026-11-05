/**
 * Builds the REST request for one route call by reading the route's compiled request
 * mapping backwards: each mapped input field goes to the path, query, header or body
 * position the server reads it from.
 */
import type { ClientRouteEntry } from "./rest-routes.types.js";

/** Where the input's fields go, collected while walking the mapping. */
interface RequestParts {
  readonly params: Map<string, string | readonly string[]>;
  readonly query: URLSearchParams;
  readonly headers: Headers;
  readonly body: Record<string, unknown>;
  readonly form: Array<readonly [string, unknown]>;
  whole: { readonly value: unknown } | undefined;
}

/**
 * Encodes one call's input as the route's REST request.
 * @param baseUrl - Backend root URL.
 * @param route - The route's client routes entry.
 * @param input - The call input.
 * @param headers - Headers already resolved for the call.
 * @returns The request URL and init; the caller adds the signal and credentials.
 * @example encodeRestRequest("http://127.0.0.1:3000", route, { orderId: "o1" }, new Headers());
 */
export function encodeRestRequest(
  baseUrl: string,
  route: ClientRouteEntry,
  input: unknown,
  headers: Headers,
): { readonly url: URL; readonly init: RequestInit } {
  const parts: RequestParts = {
    params: new Map(),
    query: new URLSearchParams(),
    headers,
    body: {},
    form: [],
    whole: undefined,
  };
  visit(route.request, input, parts);
  const url = new URL(`${rootPath(baseUrl)}${expandPath(route.path, parts.params)}`, baseUrl);
  for (const [name, value] of parts.query) url.searchParams.append(name, value);
  const init: RequestInit = { method: route.method, headers };
  if (parts.form.length > 0) {
    const form = new FormData();
    for (const [name, value] of parts.form)
      form.append(name, value instanceof Blob ? value : scalar(value));
    init.body = form;
  } else if (parts.whole !== undefined || Object.keys(parts.body).length > 0) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(parts.whole === undefined ? parts.body : parts.whole.value, json);
  }
  return { url, init };
}

/**
 * Places one mapped value.
 * @param node - Mapping node.
 * @param value - The input value at this node.
 * @param parts - Request parts being collected.
 */
function visit(node: unknown, value: unknown, parts: RequestParts): void {
  if (!isRecord(node) || typeof node.kind !== "string") return;
  const name = typeof node.name === "string" ? node.name : "";
  switch (node.kind) {
    case "input":
    case "nested":
      if (!isRecord(value) || !isRecord(node.fields)) return;
      for (const [field, child] of Object.entries(node.fields)) visit(child, value[field], parts);
      return;
    case "optional":
    case "default":
    case "transform":
      if (value !== undefined) visit(node.value, value, parts);
      return;
    case "whole-body":
      if (value !== undefined) parts.whole = { value };
      return;
  }
  if (value === undefined) return;
  switch (node.kind) {
    case "path":
      parts.params.set(name, scalar(value));
      return;
    case "path-segments":
      parts.params.set(name, Array.isArray(value) ? value.map(scalar) : [scalar(value)]);
      return;
    case "query":
      parts.query.append(name, scalar(value));
      return;
    case "header":
      parts.headers.set(name, scalar(value));
      return;
    case "body":
      parts.body[name] = value;
      return;
    case "multipart":
      parts.form.push([name, value]);
      return;
    case "multipart-all":
      for (const item of Array.isArray(value) ? value : [value]) parts.form.push([name, item]);
      return;
  }
  // Cookies, middleware values and constants are not sent by the client.
}

/**
 * Fills a route pattern such as `/orders/:orderId` or `/files/*parts`.
 * @param pattern - Route path pattern.
 * @param params - Path values by name.
 * @returns The encoded path.
 */
function expandPath(pattern: string, params: ReadonlyMap<string, string | readonly string[]>) {
  const segments = pattern.split("/").flatMap((segment) => {
    const named = /^([:*])([^?]+)(\?)?$/.exec(segment);
    if (named === null) return [segment];
    const value = params.get(named[2]!);
    if (value === undefined) return named[3] === "?" ? [] : [""];
    return (typeof value === "string" ? [value] : value).map(encodeURIComponent);
  });
  const path = segments.join("/");
  return path === "" ? "/" : path;
}

/**
 * Returns the backend root's path without its trailing slash.
 * @param baseUrl - Backend root URL.
 * @returns The path prefix, empty for an origin root.
 */
function rootPath(baseUrl: string): string {
  return new URL(baseUrl).pathname.replace(/\/+$/, "");
}

/**
 * Writes one value as a URL, header or form text value.
 * @param value - Input value.
 * @returns Its text form; dates use ISO 8601 and objects JSON.
 */
function scalar(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (value !== null && typeof value === "object") return JSON.stringify(value, json);
  return String(value);
}

/**
 * JSON replacer that writes large integers as decimal strings.
 * @param _key - Property name.
 * @param value - Property value.
 * @returns The JSON-safe value.
 */
function json(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

/**
 * Recognizes a plain object.
 * @param value - Any value.
 * @returns Whether the value is a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
