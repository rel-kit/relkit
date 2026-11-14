/** Shared authorization, pagination and encoding helpers retain the versioned core/inspection response contract without loading optional transports. */
import {
  canonicalJson,
  isJsonValue,
  type JsonValue,
  type MaybePromise,
} from "../contracts/index.js";
import type { Context } from "hono";
import { InternalQueryError, queryPage } from "./internal-endpoint-query.js";
import { getRequestState, REQUEST_ID_HEADER } from "./middleware-utils.js";
import { contextProblem } from "./problem-details.js";
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

/** Fields of the activation witness; everything else in a graph stays behind the bridge. */
const GRAPH_IDENTITY_FIELDS = [
  "generationId",
  "graphHash",
  "activationFingerprint",
  "manifestGraphHash",
  "graphContractVersion",
  "manifestContractVersion",
  "manifestGeneratorVersion",
  "sourceToken",
  "generationToken",
] as const;

/** Keep only the hashes and versions activation needs from a graph probe value.
 * @param value - Configured graph witness, possibly carrying structural graph data.
 * @returns The identity fields present in the value; structure, sources and names are dropped.
 */
export function graphIdentity(value: unknown): JsonValue {
  if (!isRecord(value)) return {};
  const identity: Record<string, JsonValue> = {};
  for (const field of GRAPH_IDENTITY_FIELDS)
    if (value[field] !== undefined) identity[field] = value[field];
  return identity;
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
  return { items: isJsonValue(value) ? [value] : value.items };
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

/** Answer an internal endpoint failure as Problem Details carrying the request's identity.
 * Control-plane paths bypass the request-span wrapper, so the request ID is set here.
 * @param context - Current Hono request context, possibly holding the framework request state.
 * @param status - HTTP status. @param code - Stable problem code. @param detail - Safe detail.
 * @param headers - Additional response headers such as `www-authenticate`.
 * @returns An `application/problem+json` response with `x-request-id` and no caching.
 */
export function internalProblem(
  context: Context,
  status: number,
  code: string,
  detail: string,
  headers: Record<string, string> = {},
): Response {
  const requestId = getRequestState(context)?.requestId ?? `request-${crypto.randomUUID()}`;
  const version = String(INTERNAL_ENDPOINT_VERSION);
  const common = { "cache-control": "no-store", "x-relkit-api-version": version };
  return contextProblem(context, {
    ...{ status, code, detail, requestId },
    headers: { ...common, [REQUEST_ID_HEADER]: requestId, ...headers },
  });
}

/** Answer a request the internal endpoint authorization rejected.
 * @param context - Current Hono request context.
 * @returns A 401 Problem Details response asking for a bearer token.
 */
export function protectedProblem(context: Context): Response {
  const detail = "This internal endpoint requires authorization.";
  const challenge = { "www-authenticate": "Bearer" };
  return internalProblem(context, 401, "internal-endpoint-protected", detail, challenge);
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
