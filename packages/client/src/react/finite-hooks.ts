"use client";

import type { QueryInput } from "./finite-hooks.types.js";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useSuspenseQuery,
  type InfiniteData,
  type UseInfiniteQueryOptions,
  type UseInfiniteQueryResult,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
  type UseSuspenseQueryOptions,
  type UseSuspenseQueryResult,
} from "@tanstack/react-query";
import { submitMutation } from "./mutation-runtime.js";
import { useRelkitClient } from "./context.js";
import { relkitKey } from "./keys.js";
import { procedureUtils, type ProcedureUtilsLike } from "./procedure.js";
import type {
  ApiMutationRoute,
  ApiQueryRoute,
  RouteError,
  RouteInput,
  RouteOutput,
} from "../api.types.js";
import { API_ROOT, apiRoutePath } from "../api.js";
import { normalizeClientError } from "../client-errors.js";
import { pendingScopeKey } from "./pending.js";
import { RelkitWriteError } from "./write-error.js";
export { RelkitWriteError } from "./write-error.js";

/**
 * Resolves the TanStack utilities and cache identity of one `api` route.
 * @param root - The provider's oRPC TanStack utilities.
 * @param route - A route from the generated `api` object.
 * @returns The route's utilities and its dotted name.
 */
function routeUtils(
  root: unknown,
  route: ApiQueryRoute | ApiMutationRoute,
): { readonly utils: ProcedureUtilsLike; readonly name: string } {
  const path = apiRoutePath(route);
  return { utils: procedureUtils(root, [API_ROOT, ...path]), name: path.join(".") };
}

/**
 * Wraps a generated query function so every failure carries `code`, `status` and `data`.
 * @param generated - Options produced by the oRPC TanStack utilities.
 * @returns The options with a normalizing query function.
 */
function normalizedQuery<Options extends object>(generated: Options): Options {
  const queryFn = (generated as { readonly queryFn?: unknown }).queryFn as
    ((...args: unknown[]) => Promise<unknown>) | undefined;
  if (queryFn === undefined) return generated;
  return {
    ...generated,
    queryFn: async (...args: unknown[]) => {
      try {
        return await queryFn(...args);
      } catch (error) {
        throw normalizeClientError(error);
      }
    },
  };
}

/**
 * Reads one `api` query route into a scope-bound TanStack query.
 * @typeParam Route - A query route from the generated `api` object.
 * @typeParam Selected - Caller-selected query result.
 * @param route - The route, such as `api.orders.getOrder`.
 * @param options - TanStack options plus the route's typed `input`.
 * @returns The typed query result; `error` narrows on `code`.
 * @example const order = useRoute(api.orders.getOrder, { input: { orderId } });
 */
export function useRoute<Route extends ApiQueryRoute, Selected = RouteOutput<Route>>(
  route: Route,
  options: QueryInput<Route, Selected>,
): UseQueryResult<Selected, RouteError<Route>> {
  const runtime = useRelkitClient();
  const { utils, name } = routeUtils(runtime.utils, route);
  const generated = normalizedQuery(utils.queryOptions({ input: options.input }));
  const enabled =
    runtime.status === "ready" && runtime.identityKey !== null && options.enabled !== false;
  return useQuery({
    ...generated,
    ...options,
    enabled,
    queryKey: runtime.scope
      ? relkitKey(runtime.scope, "query", name, options.input)
      : ["relkit", "blocked", name],
  } as UseQueryOptions<RouteOutput<Route>, RouteError<Route>, Selected>);
}

/**
 * Reads one ready `api` query route into a scope-bound suspense query.
 * @typeParam Route - A query route from the generated `api` object.
 * @typeParam Selected - Caller-selected query result.
 * @param route - The route, such as `api.orders.getOrder`.
 * @param options - TanStack options plus the route's typed `input`.
 * @returns The typed ready suspense query result.
 */
export function useSuspenseRoute<Route extends ApiQueryRoute, Selected = RouteOutput<Route>>(
  route: Route,
  options: Omit<
    UseSuspenseQueryOptions<RouteOutput<Route>, RouteError<Route>, Selected>,
    "queryKey" | "queryFn"
  > & { readonly input: RouteInput<Route> },
): UseSuspenseQueryResult<Selected, RouteError<Route>> {
  const runtime = useRelkitClient();
  if (runtime.status !== "ready" || runtime.scope === undefined || runtime.identityKey === null) {
    throw new Error(`RelKit client is not ready (${runtime.status})`);
  }
  const { utils, name } = routeUtils(runtime.utils, route);
  const generated = normalizedQuery(utils.queryOptions({ input: options.input }));
  return useSuspenseQuery({
    ...generated,
    ...options,
    queryKey: relkitKey(runtime.scope, "query", name, options.input),
  } as UseSuspenseQueryOptions<RouteOutput<Route>, RouteError<Route>, Selected>);
}

/**
 * Sends one `api` mutation route as TanStack mutation state.
 * @typeParam Route - A mutation route from the generated `api` object.
 * @typeParam Context - TanStack mutation context.
 * @param route - The route, such as `api.orders.createOrder`.
 * @param options - TanStack mutation options.
 * @returns The typed mutation result; `error` narrows on `code`.
 * @example const create = useRouteMutation(api.orders.createOrder);
 */
export function useRouteMutation<Route extends ApiMutationRoute, Context = unknown>(
  route: Route,
  options: Omit<
    UseMutationOptions<
      RouteOutput<Route>,
      RouteError<Route> | RelkitWriteError,
      RouteInput<Route>,
      Context
    >,
    "mutationKey" | "mutationFn"
  > = {},
): UseMutationResult<
  RouteOutput<Route>,
  RouteError<Route> | RelkitWriteError,
  RouteInput<Route>,
  Context
> {
  const runtime = useRelkitClient();
  const { utils, name } = routeUtils(runtime.utils, route);
  const generated = utils.mutationOptions() as Record<string, unknown>;
  const original = generated.mutationFn as (input: unknown, context: unknown) => Promise<unknown>;
  return useMutation({
    ...generated,
    ...options,
    retry: options.retry ?? false,
    networkMode: options.networkMode ?? "always",
    mutationFn: async (input: RouteInput<Route>, mutationContext: unknown) => {
      if (
        runtime.status !== "ready" ||
        runtime.scope === undefined ||
        runtime.identityKey === null ||
        runtime.identity === undefined
      ) {
        throw new RelkitWriteError("not-sent", `RelKit client is not ready (${runtime.status})`);
      }
      if (
        (globalThis as { navigator?: { readonly onLine?: boolean } }).navigator?.onLine === false
      ) {
        throw new RelkitWriteError("not-sent", "The browser is offline.");
      }
      try {
        return (await submitMutation(
          pendingScopeKey(runtime.scope),
          "mutation",
          name,
          input,
          {},
          {},
          () => original(input, mutationContext),
        )) as RouteOutput<Route>;
      } catch (error) {
        throw normalizeClientError(error);
      }
    },
    mutationKey: runtime.scope
      ? relkitKey(runtime.scope, "mutation", name)
      : ["relkit", "blocked", name],
  } as UseMutationOptions<
    RouteOutput<Route>,
    RouteError<Route> | RelkitWriteError,
    RouteInput<Route>,
    Context
  >);
}

/**
 * Reads one paginated `api` query route while retaining page and scope inference.
 * @typeParam Route - A query route from the generated `api` object.
 * @typeParam PageParam - Declared pagination cursor.
 * @typeParam Selected - Caller-selected query result.
 * @param route - The route, such as `api.orders.searchOrders`.
 * @param options - TanStack options plus an `input` function of the page parameter.
 * @returns The typed paginated query result.
 */
export function useInfiniteRoute<
  Route extends ApiQueryRoute,
  PageParam,
  Selected = InfiniteData<RouteOutput<Route>, PageParam>,
>(
  route: Route,
  options: Omit<
    UseInfiniteQueryOptions<
      RouteOutput<Route>,
      RouteError<Route>,
      Selected,
      readonly unknown[],
      PageParam
    >,
    "queryKey" | "queryFn"
  > & { readonly input: (page: PageParam) => RouteInput<Route> },
): UseInfiniteQueryResult<Selected, RouteError<Route>> {
  const runtime = useRelkitClient();
  const { utils, name } = routeUtils(runtime.utils, route);
  const generated = normalizedQuery(
    utils.infiniteOptions({ input: options.input, initialPageParam: options.initialPageParam }),
  );
  return useInfiniteQuery({
    ...generated,
    ...options,
    enabled:
      runtime.status === "ready" && runtime.identityKey !== null && options.enabled !== false,
    queryKey: runtime.scope ? relkitKey(runtime.scope, "query", name) : ["relkit", "blocked", name],
  } as UseInfiniteQueryOptions<
    RouteOutput<Route>,
    RouteError<Route>,
    Selected,
    readonly unknown[],
    PageParam
  >);
}

/**
 * Returns the oRPC TanStack utilities of one `api` route, for prefetching and invalidation.
 * @typeParam Route - A route from the generated `api` object.
 * @param route - The route, such as `api.orders.getOrder`.
 * @returns The route's query and mutation utilities.
 */
export function useRouteUtils<Route extends ApiQueryRoute | ApiMutationRoute>(route: Route) {
  const runtime = useRelkitClient();
  return routeUtils(runtime.utils, route).utils;
}
