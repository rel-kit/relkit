import { canonicalJson, isJsonValue, type JsonValue, type MaybePromise } from "@zsys/contracts";
import type { Context } from "hono";
import {
  INTERNAL_ENDPOINT_PROTOCOL,
  INTERNAL_ENDPOINT_VERSION,
  type InternalEndpointOptions,
  type InternalPage,
  type InternalQuery,
  type InternalStreamEvent,
  type QuerySource,
  type ValueSource,
} from "./internal-endpoints.js";

export class InternalQueryError extends TypeError {
  constructor() {
    super("Invalid internal endpoint query.");
    this.name = "InternalQueryError";
  }
}

export function isInvalidQueryError(value: unknown): value is InternalQueryError {
  return value instanceof InternalQueryError;
}

export async function isAuthorized(
  request: Request,
  options: InternalEndpointOptions,
): Promise<boolean> {
  if (options.authorize !== undefined) {
    try {
      if (await options.authorize(request)) return true;
    } catch {
      return false;
    }
    if (options.bearerToken === undefined) return false;
  }
  return options.bearerToken === undefined
    ? true
    : request.headers.get("authorization") === `Bearer ${options.bearerToken}`;
}

export async function listResponse(
  source: QuerySource | undefined,
  context: Context,
): Promise<Response> {
  const value = source === undefined ? [] : await resolveQuery(source, readQuery(context.req.raw));
  const page = toPage(value as JsonValue | InternalPage);
  return jsonResponse({
    items: page.items,
    ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
  });
}

export function readQuery(request: Request): InternalQuery {
  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const parsedLimit = rawLimit === null ? 50 : Number(rawLimit);
  if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1) throw new InternalQueryError();
  const query: Record<string, string | number> = { limit: Math.min(parsedLimit, 100) };
  for (const name of [
    "cursor",
    "from",
    "to",
    "severity",
    "routeId",
    "functionId",
    "outcome",
    "requestId",
    "traceId",
  ]) {
    const value = url.searchParams.get(name);
    if (value !== null && value.length > 0) query[name] = value;
  }
  return query as unknown as InternalQuery;
}

export async function resolveValue<T>(source: ValueSource<T>): Promise<T> {
  return typeof source === "function" ? await (source as () => MaybePromise<T>)() : source;
}

export async function resolveQuery(
  source: QuerySource | NonNullable<InternalEndpointOptions["stream"]>,
  query: InternalQuery,
): Promise<unknown> {
  return typeof source === "function"
    ? await (source as (query: InternalQuery) => MaybePromise<unknown>)(query)
    : source;
}

export function toPage(value: JsonValue | InternalPage): InternalPage {
  if (Array.isArray(value)) return { items: value };
  if (isRecord(value) && Array.isArray(value.items)) {
    return {
      items: value.items,
      ...(typeof value.nextCursor === "string" ? { nextCursor: value.nextCursor } : {}),
    };
  }
  return { items: [value] };
}

export function streamBody(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .filter(isStreamEvent)
    .map(
      (event) =>
        `id: ${event.cursor}\nevent: ${event.type}\ndata: ${canonicalJson({ protocol: INTERNAL_ENDPOINT_PROTOCOL, version: INTERNAL_ENDPOINT_VERSION, ...event })}\n\n`,
    )
    .join("");
}

export function jsonResponse(
  value: JsonValue,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  const payload = isRecord(value)
    ? { ...value, protocol: INTERNAL_ENDPOINT_PROTOCOL, version: INTERNAL_ENDPOINT_VERSION }
    : { data: value, protocol: INTERNAL_ENDPOINT_PROTOCOL, version: INTERNAL_ENDPOINT_VERSION };
  return new Response(canonicalJson(payload), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json",
      "x-zsys-api-version": String(INTERNAL_ENDPOINT_VERSION),
      ...headers,
    },
  });
}

function isStreamEvent(value: unknown): value is InternalStreamEvent {
  return (
    isRecord(value) &&
    typeof value.cursor === "string" &&
    typeof value.type === "string" &&
    isJsonValue(value.data)
  );
}

function isRecord(value: unknown): value is { readonly [key: string]: JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
