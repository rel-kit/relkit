import type { UseQueryOptions } from "@tanstack/react-query";
import type { ApiQueryRoute, RouteError, RouteInput, RouteOutput } from "../api.types.js";

/**
 * Query options for one `api` route, with its typed input.
 * @typeParam Route - A query route from the generated `api` object.
 * @typeParam Selected - Selected query data exposed to subscribers.
 */
export type QueryInput<Route extends ApiQueryRoute, Selected> = Omit<
  UseQueryOptions<RouteOutput<Route>, RouteError<Route>, Selected>,
  "queryKey" | "queryFn"
> & { readonly input: RouteInput<Route> };
