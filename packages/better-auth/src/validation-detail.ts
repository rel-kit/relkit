/**
 * Explains Better Auth input validation failures. better-call formats each Standard
 * Schema issue as `[location] message`, which reduces a union failure to
 * `[query] Invalid input` and drops why each accepted shape was rejected.
 */
import { acceptedShapes } from "./openapi-query.js";

/** The native SDK fields this explanation reads. */
export interface ValidatedAuth {
  readonly handler: (request: Request) => Promise<Response>;
  readonly api: object;
  readonly options: { readonly basePath?: string };
}

interface Issue {
  readonly message: string;
  readonly keys?: readonly string[];
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[];
  readonly code?: string;
  readonly errors?: readonly (readonly Issue[])[];
}

interface Endpoint {
  readonly path?: string;
  readonly options?: {
    readonly method?: string | readonly string[];
    readonly query?: unknown;
    readonly body?: unknown;
  };
}

/** One failing field; `option` numbers the accepted shape it belongs to, from 1. */
export interface ValidationDetail {
  readonly path: string;
  readonly message: string;
  readonly option?: number;
}

/**
 * Runs the native handler and, for a validation failure, names every failing field.
 * @param auth - Activated native auth instance.
 * @param request - Incoming request; a JSON body is copied before the handler reads it.
 * @returns The native response, or the same 400 with an explicit `message` and `issues`.
 * @remarks The endpoint's own schema is re-run on the parsed input only after a failure,
 * and the native response is kept whenever that cannot reproduce the failure.
 */
export async function handleWithValidationDetail(
  auth: ValidatedAuth,
  request: Request,
): Promise<Response> {
  const copy = hasJsonBody(request) ? request.clone() : undefined;
  const response = await auth.handler(request);
  try {
    if (response.status !== 400) return response;
    const payload: unknown = await response.clone().json();
    if (!isObject(payload) || payload.code !== "VALIDATION_ERROR") return response;
    const endpoint = findEndpoint(auth, request);
    const explained =
      (await explain("query", endpoint?.options?.query, () => queryOf(request))) ??
      (await explain("body", endpoint?.options?.body, () => copy?.json()));
    if (explained === undefined) return response;
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(JSON.stringify({ ...payload, ...explained }), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    return response;
  } finally {
    // Release the teed copy on every path that did not read it, instead of buffering the body
    // until it is collected.
    if (copy !== undefined && !copy.bodyUsed) void copy.body?.cancel().catch(() => {});
  }
}

/** Validates one input location and describes its issues, or undefined when it passes. */
async function explain(
  location: "query" | "body",
  schema: unknown,
  read: () => unknown,
): Promise<{ message: string; issues: ValidationDetail[] } | undefined> {
  const validate =
    isObject(schema) && isObject(schema["~standard"]) ? schema["~standard"].validate : undefined;
  if (typeof validate !== "function") return undefined;
  const input = await read();
  const result = (await validate(input)) as { readonly issues?: readonly Issue[] };
  if (result.issues === undefined || result.issues.length === 0) return undefined;
  const shapes = acceptedShapes(schema);
  const expanded = result.issues.flatMap((issue) => unrecognized(issue, shapes));
  const issues = expanded.flatMap((issue) => details(location, issue, input));
  return {
    message: expanded.map((issue) => sentence(location, issue, input)).join("; "),
    issues,
  };
}

/**
 * Splits Zod's one `unrecognized_keys` issue into one issue per field and, for a union,
 * says which shapes are accepted so combining fields from two shapes is explained.
 */
function unrecognized(issue: Issue, shapes: string | undefined, inShape = false): Issue[] {
  if (issue.code !== "unrecognized_keys" || issue.keys === undefined) return [issue];
  return issue.keys.map((key) => ({
    message: inShape
      ? "not accepted in this shape"
      : shapes === undefined
        ? "Not an accepted field"
        : `Cannot be combined with the other fields sent; send one of: ${shapes}`,
    path: [...(issue.path ?? []), key],
    code: "unrecognized_key",
  }));
}

/** Writes one issue; a union lists what each accepted shape is missing. */
function sentence(location: string, issue: Issue, input: unknown): string {
  const where = `[${pathOf(location, issue.path)}]`;
  const options = issue.code === "invalid_union" ? (issue.errors ?? []) : [];
  if (options.length < 2) return `${where} ${reason(issue, input)}`;
  const described = options.map(
    (option) =>
      `(${shapeIssues(option)
        .map(
          (inner) =>
            `${pathOf("", inner.path) || "value"}: ${reason(inner, valueAt(input, issue.path))}`,
        )
        .join(", ")})`,
  );
  return `${where} Must match one of ${options.length} shapes: ${described.join(" or ")}`;
}

function details(location: string, issue: Issue, input: unknown): ValidationDetail[] {
  const options = issue.code === "invalid_union" ? (issue.errors ?? []) : [];
  if (options.length < 2)
    return [{ path: pathOf(location, issue.path), message: reason(issue, input) }];
  const base = pathOf(location, issue.path);
  return options.flatMap((option, index) =>
    shapeIssues(option).map((inner) => ({
      path: [base, pathOf("", inner.path)].filter(Boolean).join("."),
      message: reason(inner, valueAt(input, issue.path)),
      option: index + 1,
    })),
  );
}

/** Names fields one shape of a union does not accept, one issue per field. */
function shapeIssues(option: readonly Issue[]): Issue[] {
  return option.flatMap((inner) => unrecognized(inner, undefined, true));
}

/**
 * States a missing field as required and shows what was received for a wrong value,
 * so a query value such as the text "true" is distinguishable from the boolean `true`.
 */
function reason(issue: Issue, input: unknown): string {
  const expected = /expected ([^,]+)/.exec(issue.message)?.[1];
  const text = issue.message.replace(/^Invalid input: /, "");
  const value = valueAt(input, issue.path);
  if (issue.code === "unrecognized_key" || (issue.path ?? []).length === 0) return text;
  if (value === undefined)
    return expected === undefined ? "required" : `required, expected ${expected}`;
  return /received/.test(text) ? text : `${text}, received ${received(value)}`;
}

function received(value: unknown): string {
  return typeof value === "string" ? `the text ${JSON.stringify(value)}` : JSON.stringify(value);
}

function valueAt(input: unknown, path: Issue["path"]): unknown {
  let current = input;
  for (const key of path ?? []) {
    if (!isObject(current)) return undefined;
    current = current[String(typeof key === "object" ? key.key : key) as keyof typeof current];
  }
  return current;
}

function pathOf(location: string, path: Issue["path"]): string {
  const keys = (path ?? []).map((key) => String(typeof key === "object" ? key.key : key));
  return [location, ...keys].filter(Boolean).join(".");
}

/** Matches the request to its native endpoint the way better-call routes it. */
function findEndpoint(auth: ValidatedAuth, request: Request): Endpoint | undefined {
  const base = (auth.options.basePath ?? "/api/auth").replace(/\/$/, "");
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith(base)) return undefined;
  const path = pathname.slice(base.length) || "/";
  return (Object.values(auth.api) as Endpoint[]).find((endpoint) => {
    const methods = [endpoint.options?.method ?? []].flat();
    if (!methods.includes(request.method) && !methods.includes("*")) return false;
    if (endpoint.path === undefined) return false;
    const pattern = endpoint.path
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\\?:[^/]+/g, "[^/]+");
    return new RegExp(`^${pattern}$`).test(path);
  });
}

/** Parses the query exactly as better-call does, repeating keys into arrays. */
function queryOf(request: Request): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  new URL(request.url).searchParams.forEach((value, key) => {
    const current = query[key];
    query[key] = current === undefined ? value : [current, value].flat();
  });
  return query;
}

function hasJsonBody(request: Request): boolean {
  return (
    request.body !== null &&
    (request.headers.get("content-type") ?? "").includes("application/json")
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return (typeof value === "object" || typeof value === "function") && value !== null;
}
