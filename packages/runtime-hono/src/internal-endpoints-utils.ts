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
  const query = readQuery(context.req.raw);
  const value = source === undefined ? [] : await resolveQuery(source, query);
  const page = queryPage(toPage(value as JsonValue | InternalPage), query);
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

function queryPage(page: InternalPage, query: InternalQuery): InternalPage {
  const from = query.from === undefined ? undefined : Date.parse(query.from);
  const to = query.to === undefined ? undefined : Date.parse(query.to);
  if ((from !== undefined && !Number.isFinite(from)) || (to !== undefined && !Number.isFinite(to)))
    throw new InternalQueryError();
  if (from !== undefined && to !== undefined && from > to) throw new InternalQueryError();
  const filtered = page.items.filter((item) => matchesQuery(item, query, from, to));
  const start = page.nextCursor === undefined ? cursorOffset(query.cursor) : 0;
  const items = filtered.slice(start, start + query.limit);
  const next = start + items.length < filtered.length ? String(start + items.length) : undefined;
  const nextCursor = next ?? page.nextCursor;
  return { items, ...(nextCursor === undefined ? {} : { nextCursor }) };
}

function matchesQuery(item: JsonValue, query: InternalQuery, from?: number, to?: number): boolean {
  if (!isRecord(item))
    return Object.keys(query).every((key) => key === "limit" || key === "cursor");
  const timestamp = [item.timestamp, item.startedAt, item.occurredAt, item.completedAt].find(
    (value) => typeof value === "string",
  );
  const time = typeof timestamp === "string" ? Date.parse(timestamp) : Number.NaN;
  return (
    exact(item, query.routeId, "routeId") &&
    exact(item, query.functionId, "functionId") &&
    exact(item, query.outcome, "outcome") &&
    exact(item, query.traceId, "traceId") &&
    (query.requestId === undefined ||
      item.requestId === query.requestId ||
      item.correlationId === query.requestId) &&
    (query.severity === undefined ||
      item.level === query.severity ||
      item.severity === query.severity) &&
    (from === undefined || (Number.isFinite(time) && time >= from)) &&
    (to === undefined || (Number.isFinite(time) && time <= to))
  );
}

function exact(item: Record<string, JsonValue>, value: string | undefined, key: string): boolean {
  return value === undefined || item[key] === value;
}

function cursorOffset(value: string | undefined): number {
  if (value === undefined) return 0;
  const offset = Number(value);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new InternalQueryError();
  return offset;
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
