import { canonicalJson, isJsonValue, type JsonValue, type MaybePromise } from "@relkit/contracts";
import type { Context } from "hono";
import { InternalQueryError, queryPage } from "./internal-endpoint-query.js";
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
export { InternalQueryError, isInvalidQueryError } from "./internal-endpoint-query.js";

/** Authorize an inspector request using the callback or bearer-token fallback.
 * @param request - Incoming HTTP request.
 * @param options - Runtime configuration and dependencies for this operation.
 * @returns Whether the configured authorization rule accepts the request.
 */
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

/** Resolve inspector rows, apply query filters and encode a versioned page.
 * @param source - Fixed data or a callback producing the data.
 * @param context - Current Hono or RPC request context.
 * @returns A JSON response containing items and any continuation cursor.
 */
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

/** Parse supported inspector filters and clamp valid page sizes to 100.
 * @param request - Incoming HTTP request.
 * @returns A query with a default limit of 50; invalid limits throw.
 */
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

/** Resolve a fixed inspector value or a lazy value callback.
 * @typeParam T - Value produced by the source or selected by the predicate.
 * @param source - Fixed data or a callback producing the data.
 * @returns The resolved value after any callback Promise settles.
 */
export async function resolveValue<T>(source: ValueSource<T>): Promise<T> {
  return typeof source === "function" ? await (source as () => MaybePromise<T>)() : source;
}

/** Resolve a fixed inspector source or call it with a parsed query.
 * @param source - Fixed data or a callback producing the data.
 * @param query - Validated inspector query.
 * @returns The source result after any callback Promise settles.
 */
export async function resolveQuery(
  source: QuerySource | NonNullable<InternalEndpointOptions["stream"]>,
  query: InternalQuery,
): Promise<unknown> {
  return typeof source === "function"
    ? await (source as (query: InternalQuery) => MaybePromise<unknown>)(query)
    : source;
}

/** Normalize an inspector array, page or scalar into a page shape.
 * @param value - Value to validate or project.
 * @returns Items and any supplied string continuation cursor.
 */
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

/** Encode supported inspector events as versioned SSE blocks.
 * @param value - Value to validate or project.
 * @returns Serialized events, or an empty string for a non-array input.
 */
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

/** Encode a JSON value with the transport's required response metadata.
 * @param value - Value to validate or project.
 * @param status - HTTP response status.
 * @param headers - Response or request header values.
 * @returns The HTTP response with the supplied status and JSON content type.
 */
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
      "x-relkit-api-version": String(INTERNAL_ENDPOINT_VERSION),
      ...headers,
    },
  });
}

/** Recognize inspector events with a string cursor, type and JSON payload.
 * @param value - Value to validate or project.
 * @returns Whether the value can be serialized as an inspector stream event.
 */
function isStreamEvent(value: unknown): value is InternalStreamEvent {
  return (
    isRecord(value) &&
    typeof value.cursor === "string" &&
    typeof value.type === "string" &&
    isJsonValue(value.data)
  );
}

/** Check whether a value is a non-null object suitable for field inspection.
 * @param value - Value to validate or project.
 * @returns Whether object fields can be inspected.
 */
function isRecord(value: unknown): value is { readonly [key: string]: JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
