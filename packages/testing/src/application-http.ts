import { createFunctionRequest, type FunctionRequestValue } from "@zsys/contracts";
import type { TestRoute } from "./application-routes.js";
import { normalizeFailure, toPublicEnvelope } from "@zsys/runtime-effect";
import type { TestRuntime } from "./runtime.js";

export async function handleTestRequest(
  routes: readonly TestRoute[],
  runtime: TestRuntime,
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const matched = routes.find((route) => route.method === request.method && match(route.path, url));
  if (matched === undefined) return new Response("Not found", { status: 404 });
  const params = match(matched.path, url) ?? {};
  const handlerRequest = createFunctionRequest(request.clone(), {
    params,
    query: queryValues(url),
    headers: headerValues(request),
    metadata: { pathPattern: matched.path },
  });
  const body = await readBody(request);
  try {
    for (const middleware of matched.middleware ?? []) {
      await runtime.invoke(
        middleware.target,
        mapInput(middleware.request, url, params, request, body),
        { request: handlerRequest.clone() },
      );
    }
    const value = await runtime.invoke(
      matched.target,
      mapInput(matched.request, url, params, request, body),
      { request: handlerRequest.clone() },
    );
    const status = matched.responses.find((response) => response.kind === "success")?.status ?? 200;
    const response = new Response(value === undefined ? null : JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    });
    return request.method === "HEAD"
      ? new Response(null, { status: response.status, headers: response.headers })
      : response;
  } catch (error) {
    const failure = normalizeFailure(error);
    if (failure.kind === "application") {
      const declaration = matched.responses.find(
        (response) =>
          response.kind === "error" &&
          (response.errorId === failure.id || response.id === failure.id),
      );
      if (declaration !== undefined) {
        return new Response(JSON.stringify(toPublicEnvelope(failure)), {
          status: declaration.status ?? failure.status ?? 500,
          headers: { "content-type": "application/json" },
        });
      }
    }
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  }
}

function mapInput(
  mapping: unknown,
  url: URL,
  params: Readonly<Record<string, string | readonly string[]>>,
  request: Request,
  body: unknown,
): unknown {
  if (!isRecord(mapping)) return {};
  if (mapping.kind === "input" || mapping.kind === "nested") {
    const fields = isRecord(mapping.fields) ? mapping.fields : {};
    return Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [
        key,
        mapInput(value, url, params, request, body),
      ]),
    );
  }
  if (mapping.kind === "constant") return mapping.value;
  if (mapping.kind === "default") {
    const value = mapInput(mapping.value, url, params, request, body);
    return value === undefined ? mapping.default : value;
  }
  if (mapping.kind === "optional") return mapInput(mapping.value, url, params, request, body);
  if (mapping.kind === "query") return url.searchParams.get(String(mapping.name)) ?? undefined;
  if (mapping.kind === "path" || mapping.kind === "path-segments") {
    return params[String(mapping.name)];
  }
  if (mapping.kind === "header") return request.headers.get(String(mapping.name)) ?? undefined;
  if (mapping.kind === "cookie") return cookie(request.headers.get("cookie"), String(mapping.name));
  if (mapping.kind === "body") {
    return mapping.name === undefined ? body : valueAt(body, String(mapping.name));
  }
  if (mapping.kind === "whole-body") return body;
  if (mapping.kind === "multipart") {
    return body instanceof FormData ? (body.get(String(mapping.name)) ?? undefined) : undefined;
  }
  if (mapping.kind === "multipart-all") {
    return body instanceof FormData ? body.getAll(String(mapping.name)) : [];
  }
  if (mapping.kind === "transform") return mapInput(mapping.value, url, params, request, body);
  throw new TypeError(`Unsupported test HTTP mapping: ${String(mapping.kind)}`);
}

async function readBody(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    return request.formData();
  }
  const text = await request.text();
  if (text === "") return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function cookie(header: string | null, name: string): string | undefined {
  const encoded = header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (encoded === undefined) return undefined;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

function match(path: string, url: URL): Record<string, string | readonly string[]> | undefined {
  const expected = path.split("/").filter(Boolean);
  const actual = url.pathname.split("/").filter(Boolean);
  const params: Record<string, string | readonly string[]> = {};
  for (let index = 0; index < expected.length; index += 1) {
    const segment = expected[index]!;
    if (segment.startsWith("*")) {
      const values = actual.slice(index).map(decodeURIComponent);
      if (!segment.endsWith("?") && values.length === 0) return undefined;
      if (values.length > 0) params[segment.slice(1).replace(/\?$/, "")] = values;
      return params;
    }
    const value = actual[index];
    if (value === undefined) return undefined;
    if (segment.startsWith(":")) params[segment.slice(1)] = decodeURIComponent(value);
    else if (segment !== value) return undefined;
  }
  return actual.length === expected.length ? params : undefined;
}

function valueAt(value: unknown, name: string): unknown {
  return isRecord(value) ? value[name] : undefined;
}

function queryValues(url: URL): Record<string, FunctionRequestValue> {
  const values: Record<string, FunctionRequestValue> = {};
  for (const [key, value] of url.searchParams.entries()) append(values, key, value);
  return values;
}

function headerValues(request: Request): Record<string, FunctionRequestValue> {
  const values: Record<string, FunctionRequestValue> = {};
  for (const [key, value] of request.headers.entries()) {
    // ponytail: Fetch Headers combines repeated values; split the normalized transport value to match Hono.
    const parts = value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    values[key] = parts.length > 1 ? parts : value;
  }
  return values;
}

function append(target: Record<string, FunctionRequestValue>, key: string, value: string): void {
  const previous = target[key];
  target[key] =
    previous === undefined
      ? value
      : Array.isArray(previous)
        ? [...previous, value]
        : [previous, value];
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
