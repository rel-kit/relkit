import type { FunctionRequest, FunctionRequestValue } from "@zsys/contracts";

/** Gives each handler/policy a frozen view over its own request clone. */
export function isolateFunctionRequest(
  request: FunctionRequest | undefined,
): FunctionRequest | undefined {
  if (request === undefined) return undefined;
  const source = cloneRequest(request);
  const params = cloneCollection(source.params ?? {});
  const query = cloneCollection(source.query ?? {});
  const headers = isolateHeaders(source);
  const metadata = Object.freeze({ ...(source.metadata ?? {}), kind: "http" as const });
  const body = cloneFrozenBody(source.body, new WeakMap());
  const view: FunctionRequest = {
    method: source.method,
    url: source.url,
    params,
    query,
    headers,
    metadata,
    get body() {
      return body;
    },
    get bodyUsed() {
      return source.bodyUsed;
    },
    clone: () => isolateFunctionRequest(source.clone()) as FunctionRequest,
    arrayBuffer: () => source.arrayBuffer(),
    json: () => source.json(),
    text: () => source.text(),
  };
  return Object.freeze(view);
}

function isolateHeaders(source: FunctionRequest): FunctionRequest["headers"] {
  const values = cloneCollection(source.headers.values ?? {});
  const getAll = (name: string): readonly string[] => {
    const value = findHeader(values, name);
    if (value === undefined) {
      const fallback = source.headers.get(name);
      return fallback === null ? EMPTY : Object.freeze([fallback]);
    }
    return Object.freeze(Array.isArray(value) ? [...value] : [value]);
  };
  return Object.freeze({
    values,
    get: (name: string) => {
      const entries = getAll(name);
      return entries.length === 0 ? null : entries.join(", ");
    },
    getAll,
  });
}

function findHeader(
  values: Readonly<Record<string, FunctionRequestValue>>,
  name: string,
): FunctionRequestValue | undefined {
  const key = Object.keys(values).find(
    (candidate) => candidate.toLowerCase() === name.toLowerCase(),
  );
  return key === undefined ? undefined : values[key];
}

function cloneCollection(
  values: Readonly<Record<string, FunctionRequestValue>>,
): Readonly<Record<string, FunctionRequestValue>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key,
        Array.isArray(value) ? Object.freeze([...value]) : value,
      ]),
    ),
  );
}

function cloneRequest(request: FunctionRequest): FunctionRequest {
  return typeof request.clone === "function" ? request.clone() : request;
}

function cloneFrozenBody(value: unknown, seen: WeakMap<object, object>): unknown {
  if (value === null || typeof value !== "object") return value;
  const existing = seen.get(value);
  if (existing !== undefined) return existing;
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const item of value) copy.push(cloneFrozenBody(item, seen));
    return Object.freeze(copy);
  }
  const prototype = Object.getPrototypeOf(value);
  // ponytail: opaque request bodies stay on their invocation-local clone; deep-clone them only if required.
  if (prototype !== Object.prototype && prototype !== null) return value;
  const copy: Record<string, unknown> = {};
  seen.set(value, copy);
  for (const [key, child] of Object.entries(value)) copy[key] = cloneFrozenBody(child, seen);
  return Object.freeze(copy);
}

const EMPTY = Object.freeze([]) as readonly string[];
