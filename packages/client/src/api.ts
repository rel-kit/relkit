import type { ApiClient, ApiRoute, AnyRouteContract } from "./api.types.js";
import type { ClientApi } from "./index.js";
import type { CreateClientOptions } from "./index.types.js";
import { createClient } from "./transport.js";
import { normalizeClientError } from "./client-errors.js";

/** Router key under which the RPC transport mounts the API tree; matches `relkit/contracts`. */
export const API_ROOT = "api";

const pathKey = "~route";

/**
 * The generated application's routes, grouped by service: `api.orders.getOrder`.
 *
 * Each property is a reference that the React hooks take, such as
 * `useRoute(api.orders.getOrder, { input })`. Its type comes from the generated
 * `client-registry.d.ts`; at runtime it is a lazy proxy, so a route the backend adds
 * during development is usable without restarting the frontend.
 * @example useRoute(api.orders.getOrder, { input: { orderId: "o1" } });
 * @category Client
 */
export const api: ClientApi = branch([], () => undefined) as ClientApi;

/**
 * Creates a callable copy of {@link api} bound to one backend.
 * @param options - HTTP transport and authentication configuration.
 * @returns The API tree; each route is a function returning its output and can also be
 * passed to the React hooks.
 * @example
 * ```ts
 * const backend = createApi({ baseUrl: "http://127.0.0.1:3000" });
 * const order = await backend.orders.getOrder({ orderId: "o1" });
 * ```
 * @category Client
 */
export function createApi(options: CreateClientOptions): ApiClient<ClientApi> {
  const client = createClient(options);
  return branch([], (path) => async (input: unknown, call?: { signal?: AbortSignal }) => {
    const procedure = resolve(client, [API_ROOT, ...path]);
    if (typeof procedure !== "function")
      throw new TypeError(`Unknown RelKit API route "${path.join(".")}"`);
    try {
      return await procedure(input, call?.signal === undefined ? {} : { signal: call.signal });
    } catch (error) {
      throw normalizeClientError(error);
    }
  }) as ApiClient<ClientApi>;
}

/**
 * Reads the route path an `api` property refers to.
 * @param route - A property of {@link api} or of a {@link createApi} result.
 * @returns The path below the API root, such as `["orders", "getOrder"]`.
 * @throws TypeError when the value is not an API route reference.
 * @example apiRoutePath(api.orders.getOrder); // ["orders", "getOrder"]
 */
export function apiRoutePath(route: ApiRoute<AnyRouteContract>): readonly string[] {
  const path = (route as unknown as Record<string, unknown> | undefined)?.[pathKey];
  if (!Array.isArray(path) || path.length === 0)
    throw new TypeError("Pass a route from the generated `api` object, such as api.orders.get.");
  return path as readonly string[];
}

/**
 * Builds one lazily expanding, referentially stable tree node.
 * @param path - Path of this node below the API root.
 * @param call - Produces the callable behaviour for a path, or undefined for references.
 * @returns A proxy whose properties are child nodes.
 */
function branch(
  path: readonly string[],
  call: (path: readonly string[]) => ((...args: never[]) => unknown) | undefined,
): unknown {
  const children = new Map<string, unknown>();
  const target = call(path) ?? Object.create(null);
  return new Proxy(target, {
    get(_target, key) {
      if (key === pathKey) return path;
      if (typeof key !== "string" || key === "then") return undefined;
      let child = children.get(key);
      if (child === undefined) {
        child = branch([...path, key], call);
        children.set(key, child);
      }
      return child;
    },
    has: (_target, key) => key === pathKey,
  });
}

/**
 * Walks a nested client by path.
 * @param root - Nested client or utility proxy.
 * @param path - Property path.
 * @returns The value at the path, or undefined.
 */
function resolve(root: unknown, path: readonly string[]): unknown {
  let value = root;
  for (const key of path) {
    if (value === null || (typeof value !== "object" && typeof value !== "function"))
      return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
