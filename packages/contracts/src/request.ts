export type FunctionRequestValue = string | readonly string[];

/** Immutable normalized HTTP headers, including repeated values. */
export interface FunctionRequestHeaders {
  readonly get: (name: string) => string | null;
  readonly getAll: (name: string) => readonly string[];
  readonly values: Readonly<Record<string, FunctionRequestValue>>;
}

/** Bounded HTTP metadata attached to a framework-neutral request view. */
export interface FunctionRequestMetadata {
  readonly kind: "http";
  readonly routeId?: string;
  readonly pathPattern?: string;
  readonly requestId?: string;
  readonly traceId?: string;
  readonly correlationId?: string;
}

/**
 * Immutable transport data exposed separately from reusable function input.
 * Non-HTTP invocations pass no request. Path values that are not mapped into
 * input remain available through `params`, and repeated query/header values
 * are represented as readonly arrays.
 */
export interface FunctionRequest {
  readonly method: string;
  readonly url: string;
  readonly params: Readonly<Record<string, FunctionRequestValue>>;
  readonly query: Readonly<Record<string, FunctionRequestValue>>;
  readonly headers: FunctionRequestHeaders;
  readonly metadata: FunctionRequestMetadata;
  readonly body: unknown;
  readonly bodyUsed: boolean;
  readonly clone: () => FunctionRequest;
  readonly arrayBuffer: () => Promise<ArrayBuffer>;
  readonly json: () => Promise<unknown>;
  readonly text: () => Promise<string>;
}

export interface FunctionRequestSource {
  readonly method: string;
  readonly url: string;
  readonly body: unknown;
  readonly bodyUsed: boolean;
  readonly clone: () => FunctionRequestSource;
  readonly arrayBuffer: () => Promise<ArrayBuffer>;
  readonly json: () => Promise<unknown>;
  readonly text: () => Promise<string>;
}

export interface FunctionRequestMaterializationOptions {
  readonly params: Readonly<Record<string, FunctionRequestValue>>;
  readonly query: Readonly<Record<string, FunctionRequestValue>>;
  readonly headers: Readonly<Record<string, FunctionRequestValue>>;
  readonly metadata: Omit<FunctionRequestMetadata, "kind"> & { readonly kind?: "http" };
}

/** Creates an immutable framework-neutral view over a Fetch-compatible request. */
export function createFunctionRequest(
  source: FunctionRequestSource,
  options: FunctionRequestMaterializationOptions,
): FunctionRequest {
  const params = freezeValues(options.params);
  const query = freezeValues(options.query);
  const headers = createHeaders(options.headers);
  const metadata = Object.freeze({ ...options.metadata, kind: "http" as const });
  return createFunctionRequestView(source, params, query, headers, metadata);
}

function createFunctionRequestView(
  source: FunctionRequestSource,
  params: Readonly<Record<string, FunctionRequestValue>>,
  query: Readonly<Record<string, FunctionRequestValue>>,
  headers: FunctionRequestHeaders,
  metadata: FunctionRequestMetadata,
): FunctionRequest {
  const view: FunctionRequest = {
    method: source.method,
    url: source.url,
    params,
    query,
    headers,
    metadata,
    get body() {
      return source.body;
    },
    get bodyUsed() {
      return source.bodyUsed;
    },
    clone: () => createFunctionRequestView(source.clone(), params, query, headers, metadata),
    arrayBuffer: () => source.arrayBuffer(),
    json: () => source.json(),
    text: () => source.text(),
  };
  return Object.freeze(view);
}

function freezeValues(
  values: Readonly<Record<string, FunctionRequestValue>>,
): Readonly<Record<string, FunctionRequestValue>> {
  const copy: Record<string, FunctionRequestValue> = {};
  for (const [key, value] of Object.entries(values)) {
    copy[key] = Array.isArray(value) ? Object.freeze([...value]) : value;
  }
  return Object.freeze(copy);
}

function createHeaders(
  values: Readonly<Record<string, FunctionRequestValue>>,
): FunctionRequestHeaders {
  const normalized: Record<string, FunctionRequestValue> = {};
  for (const [key, value] of Object.entries(values)) {
    normalized[key.toLowerCase()] = Array.isArray(value) ? Object.freeze([...value]) : value;
  }
  const frozenValues = Object.freeze(normalized);
  const getAll = (name: string): readonly string[] => {
    const value = frozenValues[name.toLowerCase()];
    if (value === undefined) return EMPTY;
    return Object.freeze(Array.isArray(value) ? [...value] : [value]);
  };
  return Object.freeze({
    values: frozenValues,
    get: (name: string) => {
      const entries = getAll(name);
      return entries.length === 0 ? null : entries.join(", ");
    },
    getAll,
  });
}

const EMPTY = Object.freeze([]) as readonly string[];
