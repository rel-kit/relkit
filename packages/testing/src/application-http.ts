import type { TestRoute } from "./application-routes.js";
import { InvocationValidationError } from "@relkit/engine";
import { normalizeFailure, toPublicEnvelope } from "@relkit/runtime-effect";
import type { TestRuntime } from "./runtime.js";
/**
 * Dispatches a matched route through existing engine validation and error mapping.
 * @param routes - Loaded native filesystem routes.
 * @param runtime - Acquired deterministic invocation runtime.
 * @param request - Native operation input carrying explicit identity and execution context.
 * @returns The native HTTP response with the established status and error envelope.
 */
export async function handleTestRequest(
  routes: readonly TestRoute[],
  runtime: TestRuntime,
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const matched = routes.find(
    (route) =>
      (route.method === request.method || route.method === "ALL") && match(route.path, url),
  );
  if (matched === undefined) return new Response("Not found", { status: 404 });
  if ("handler" in matched) return matched.handler(request);
  const params = match(matched.path, url) ?? {};
  const body = await readBody(request);
  try {
    const value = await runtime.invoke(
      matched.target,
      mapInput(matched.request, url, params, request, body),
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
    if (error instanceof InvocationValidationError && error.phase === "input") {
      const status =
        matched.responses.find((response) => response.kind === "validation-error")?.status ?? 422;
      return Response.json(
        {
          error: "validation",
          issues: error.issues.map((issue) => ({
            code: "validation",
            message: issue.message.slice(0, 500),
            path:
              issue.path?.map((part) =>
                typeof part === "object" && part !== null && "key" in part ? part.key : part,
              ) ?? [],
          })),
        },
        { status },
      );
    }
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

/**
 * Projects declared HTTP fields into the function input without exposing Request.
 * @param mapping - Declared HTTP field projection policy.
 * @param url - Native request URL or URL pathname.
 * @param params - Matched route parameter values.
 * @param request - Native operation input carrying explicit identity and execution context.
 * @param body - Previously decoded native request body.
 * @returns The input object consumed by the descriptor validator.
 */
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

/**
 * Reads request content according to its native content type.
 * @param request - Native operation input carrying explicit identity and execution context.
 * @returns Parsed JSON or text; absent or invalid content follows the existing route contract.
 */
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

/**
 * Selects and decodes one named request cookie.
 * @param header - Native Cookie header value.
 * @param name - Declared field or policy name used by existing validation errors.
 * @returns The decoded value or undefined when absent.
 */
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

/**
 * Matches a filesystem route pattern against a URL pathname.
 * @param path - Native module path or route path being resolved.
 * @param url - Native request URL or URL pathname.
 * @returns Captured path fields or undefined when the route does not match.
 */
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

/**
 * Selectively reads one field after checking its containing record.
 * @param value - Candidate native value checked or detached by this helper.
 * @param name - Declared field or policy name used by existing validation errors.
 * @returns The requested field value or undefined.
 */
function valueAt(value: unknown, name: string): unknown {
  return isRecord(value) ? value[name] : undefined;
}

/**
 * Checks the shallow non-array object shape before selective property access.
 * @param value - Candidate native value checked or detached by this helper.
 * @returns True for a non-null non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
